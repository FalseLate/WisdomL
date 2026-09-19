package com.example.backend.reading.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.backend.auth.JwtAuth;
import com.example.backend.entity.UserWrongQuestion;
import com.example.backend.mapper.UserWrongQuestionMapper;
import com.example.backend.reading.entity.ReadingArticle;
import com.example.backend.reading.entity.ReadingDone;
import com.example.backend.reading.mapper.ReadingArticleMapper;
import com.example.backend.reading.mapper.ReadingDoneMapper;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.SystemMessage;
import io.agentscope.core.message.TextBlock;
import io.agentscope.core.message.UserMessage;
import io.agentscope.core.model.ChatResponse;
import io.agentscope.core.model.GenerateOptions;
import io.agentscope.extensions.model.openai.OpenAIChatModel;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 分级阅读：文章列表/详情（离线预生成入库）+ 句子结构解析（GLM 实时解析，内存缓存）
 */
@Slf4j
@RestController
@RequestMapping("/api/reading")
public class ReadingController {

    @Resource
    private ReadingArticleMapper articleMapper;

    @Resource
    private ReadingDoneMapper readingDoneMapper;

    @Resource
    private UserWrongQuestionMapper wrongQuestionMapper;

    @Resource
    private JwtAuth jwtAuth;

    @Resource
    private OpenAIChatModel zhipuChatModel;

    private static final String ANALYZE_SYS_PROMPT = """
            你是英语语法老师。用户给出一个英文句子，请严格只输出一个 JSON 对象（不要 markdown 代码块、不要多余文字），结构如下：
            {
              "translation": "整句中文翻译",
              "chunks": [ {"role": "成分名（如 主语/谓语/宾语/定语从句/状语 等）", "text": "对应的英文片段", "desc": "一句话说明"} ],
              "grammar": "整句语法要点一句话总结（涉及什么从句/时态/结构）"
            }
            chunks 按「主句主干在前、修饰成分在后」排序，text 必须是原句中连续出现的英文片段。
            """;

    /** 句子解析结果缓存：同一句第二次点秒出（进程内存，重启清空可接受） */
    private final Map<String, Map<String, Object>> analyzeCache = new ConcurrentHashMap<>();

    // 文章列表（不返回正文，列表轻量）
    @GetMapping("/articles")
    public Map<String, Object> articles(@RequestParam(required = false) String level) {
        LambdaQueryWrapper<ReadingArticle> wrapper = Wrappers.<ReadingArticle>lambdaQuery()
                .select(ReadingArticle::getId, ReadingArticle::getTitle,
                        ReadingArticle::getLevel, ReadingArticle::getGenre)
                .orderByAsc(ReadingArticle::getId);
        if (level != null && !level.isBlank() && !"all".equals(level)) {
            wrapper.eq(ReadingArticle::getLevel, level);
        }
        Map<String, Object> res = new HashMap<>();
        res.put("code", 200);
        res.put("data", articleMapper.selectList(wrapper));
        return res;
    }

    // 文章详情（含结构化正文 JSON）
    @GetMapping("/article/{id}")
    public Map<String, Object> article(@PathVariable Long id) {
        Map<String, Object> res = new HashMap<>();
        ReadingArticle article = articleMapper.selectById(id);
        if (article == null) {
            res.put("code", 404);
            res.put("msg", "文章不存在");
            return res;
        }
        res.put("code", 200);
        res.put("data", article);
        return res;
    }

    // 当前用户是否已做完该文章的理解题（做完后阅读页不再显示题目）
    @GetMapping("/done")
    public Map<String, Object> done(@RequestParam Long articleId) {
        Map<String, Object> res = new HashMap<>();
        boolean finished = readingDoneMapper.selectCount(
                Wrappers.<ReadingDone>lambdaQuery()
                        .eq(ReadingDone::getUserId, jwtAuth.getCurrentUserId())
                        .eq(ReadingDone::getArticleId, articleId)) > 0;
        res.put("code", 200);
        res.put("data", finished);
        return res;
    }

    /**
     * 交卷：标记文章已完成 + 答错的题写入错题本（复用 user_wrong_question，
     * questionId = reading-{articleId}-{题号}，同一题再次答错只累加 wrongCount）
     */
    @PostMapping("/finish-quiz")
    public Map<String, Object> finishQuiz(@RequestBody Map<String, Object> param) {
        Map<String, Object> res = new HashMap<>();
        try {
            Long userId = jwtAuth.getCurrentUserId();
            Long articleId = Long.valueOf(String.valueOf(param.get("articleId")));
            String articleTitle = String.valueOf(param.getOrDefault("articleTitle", ""));

            // 完成标记（唯一键幂等，重复交卷不报错）
            if (readingDoneMapper.selectCount(Wrappers.<ReadingDone>lambdaQuery()
                    .eq(ReadingDone::getUserId, userId)
                    .eq(ReadingDone::getArticleId, articleId)) == 0) {
                ReadingDone done = new ReadingDone();
                done.setUserId(userId);
                done.setArticleId(articleId);
                readingDoneMapper.insert(done);
            }

            // 错题入库
            int saved = 0;
            Object wrongsObj = param.get("wrongs");
            if (wrongsObj instanceof List<?> wrongs) {
                com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
                for (Object o : wrongs) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> w = (Map<String, Object>) o;
                    int qi = Integer.parseInt(String.valueOf(w.get("qi")));
                    String stem = String.valueOf(w.getOrDefault("stem", ""));
                    String userAnswer = letterOf(w.get("picked"));
                    String correctAnswer = letterOf(w.get("answer"));
                    String explain = "【阅读·" + articleTitle + "】" + String.valueOf(w.getOrDefault("explain", ""));
                    String questionId = "reading-" + articleId + "-" + qi;

                    // 错题本卡片渲染需要 {question, options:{A:B:C:D}} 结构，选项字母做键
                    Map<String, Object> content = new HashMap<>();
                    content.put("question", stem);
                    content.put("options", optionsAsMap(w.get("options")));
                    content.put("source", "reading");
                    String questionContent = om.writeValueAsString(content);

                    UserWrongQuestion existing = wrongQuestionMapper.selectOne(
                            new LambdaQueryWrapper<UserWrongQuestion>()
                                    .eq(UserWrongQuestion::getUserId, userId)
                                    .eq(UserWrongQuestion::getQuestionId, questionId)
                                    .eq(UserWrongQuestion::getIsRemoved, 0));
                    if (existing != null) {
                        existing.setWrongCount(existing.getWrongCount() + 1);
                        existing.setUserAnswer(userAnswer);
                        wrongQuestionMapper.updateById(existing);
                    } else {
                        UserWrongQuestion wq = new UserWrongQuestion();
                        wq.setUserId(userId);
                        wq.setQuestionId(questionId);
                        wq.setQuestionContent(questionContent);
                        wq.setQuestionType("single");
                        wq.setUserAnswer(userAnswer);
                        wq.setCorrectAnswer(correctAnswer);
                        wq.setExplanation(explain.length() > 500 ? explain.substring(0, 500) : explain);
                        wq.setWrongCount(1);
                        wq.setIsRemoved(0);
                        wrongQuestionMapper.insert(wq);
                    }
                    saved++;
                }
            }
            res.put("code", 200);
            res.put("saved", saved);
        } catch (Exception e) {
            log.error("阅读交卷失败", e);
            res.put("code", 500);
            res.put("msg", "交卷失败: " + e.getMessage());
        }
        return res;
    }

    /** 选项下标转字母，供错题本展示 */
    private String letterOf(Object idx) {
        try {
            int i = Integer.parseInt(String.valueOf(idx));
            return i >= 0 && i < 26 ? String.valueOf((char) ('A' + i)) : String.valueOf(idx);
        } catch (Exception e) {
            return String.valueOf(idx);
        }
    }

    /** options 数组转 {A:.., B:..} 供错题本卡片渲染 */
    @SuppressWarnings("unchecked")
    private Map<String, Object> optionsAsMap(Object options) {
        Map<String, Object> m = new HashMap<>();
        if (options instanceof List<?> list) {
            for (int i = 0; i < list.size() && i < 8; i++) {
                m.put(String.valueOf((char) ('A' + i)), list.get(i));
            }
        } else if (options instanceof Map) {
            m.putAll((Map<String, Object>) options);
        }
        return m;
    }

    // 句子结构解析：GLM 单次调用，低温 + 关思考，结果内存缓存
    @PostMapping("/analyze")
    public Map<String, Object> analyze(@RequestBody Map<String, String> param) {
        Map<String, Object> res = new HashMap<>();
        String text = param.get("text");
        if (text == null || text.isBlank()) {
            res.put("code", 400);
            res.put("msg", "text 不能为空");
            return res;
        }
        String key = text.trim().toLowerCase();
        Map<String, Object> cached = analyzeCache.get(key);
        if (cached != null) {
            res.put("code", 200);
            res.put("data", cached);
            res.put("cached", true);
            return res;
        }
        try {
            List<Msg> messages = List.of(
                    new SystemMessage(ANALYZE_SYS_PROMPT),
                    new UserMessage(text));
            GenerateOptions options = GenerateOptions.builder()
                    .temperature(0.2)
                    .maxTokens(1024)
                    .additionalBodyParams(Map.of("thinking", Map.of("type", "disabled")))
                    .build();
            StringBuilder sb = new StringBuilder();
            zhipuChatModel.stream(messages, List.of(), options)
                    .flatMapIterable(resp -> resp.getContent().stream()
                            .filter(TextBlock.class::isInstance)
                            .map(b -> ((TextBlock) b).getText())
                            .filter(s -> !s.isEmpty())
                            .toList())
                    .doOnNext(sb::append)
                    .blockLast(java.time.Duration.ofSeconds(60));
            Map<String, Object> data = parseAnalyzeJson(sb.toString());
            if (data == null) {
                res.put("code", 500);
                res.put("msg", "解析结果格式异常，请重试");
                return res;
            }
            analyzeCache.put(key, data);
            res.put("code", 200);
            res.put("data", data);
        } catch (Exception e) {
            log.error("句子解析失败: {}", text, e);
            res.put("code", 500);
            res.put("msg", "解析失败: " + e.getMessage());
        }
        return res;
    }

    /** 剥掉可能的 markdown 代码块围栏后解析 JSON，失败返回 null */
    private Map<String, Object> parseAnalyzeJson(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String s = raw.trim();
        if (s.startsWith("```")) {
            s = s.replaceFirst("^```(json)?", "").replaceFirst("```\\s*$", "").trim();
        }
        int start = s.indexOf('{');
        int end = s.lastIndexOf('}');
        if (start < 0 || end <= start) {
            return null;
        }
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper()
                    .readValue(s.substring(start, end + 1), Map.class);
        } catch (Exception e) {
            return null;
        }
    }
}
