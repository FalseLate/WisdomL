package com.example.backend.english.controller;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.backend.english.agent.AgentChatService;
import com.example.backend.auth.JwtAuth;
import com.example.backend.english.entity.EnglishStudyLog;
import com.example.backend.english.mapper.EnglishStudyLogMapper;
import com.example.backend.english.rag.WikiKnowledgeService;
import com.example.backend.entity.UserWord;
import com.example.backend.service.UserWordService;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 学习周报（PDCA Check 环节量化输出）：
 * 统计本周新词 / 复习次数与正确率 / 错题重做与攻克 / 沉淀笔记，AI 生成中文点评。
 * 数据源全部来自自己的表（user_word / english_study_log / english_wrong_ext / wiki 私人条目）。
 */
@RestController
@RequestMapping("/api/english/report")
public class EnglishReportController {

    private static final Logger log = LoggerFactory.getLogger(EnglishReportController.class);

    @Resource
    private JwtAuth jwtAuth;
    @Resource
    private UserWordService userWordService;
    @Resource
    private EnglishStudyLogMapper studyLogMapper;
    @Resource
    private com.example.backend.english.mapper.EnglishWrongExtMapper extMapper;
    @Resource
    private WikiKnowledgeService wikiKnowledgeService;
    @Resource
    private AgentChatService agentChatService;

    @GetMapping("/weekly")
    public Map<String, Object> weekly() {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        LocalDateTime weekStart = LocalDateTime.now().with(DayOfWeek.MONDAY).toLocalDate().atStartOfDay();

        // 1. 本周新增生词
        List<UserWord> allWords = userWordService.list(Wrappers.<UserWord>lambdaQuery()
                .eq(UserWord::getUserId, userId));
        int newWords = (int) allWords.stream()
                .filter(w -> w.getCreateTime() != null && w.getCreateTime().isAfter(weekStart))
                .count();

        // 2. 本周复习生词：次数 + 正确率
        List<EnglishStudyLog> logs = studyLogMapper.selectList(Wrappers.<EnglishStudyLog>lambdaQuery()
                .eq(EnglishStudyLog::getUserId, userId)
                .eq(EnglishStudyLog::getLogType, 1)
                .ge(EnglishStudyLog::getCreatedAt, weekStart));
        int reviewCount = logs.size();
        long reviewCorrect = logs.stream().filter(l -> l.getCorrect() != null && l.getCorrect() == 1).count();

        // 3. 本周错题重做：次数 + 攻克数
        List<EnglishStudyLog> redoLogs = studyLogMapper.selectList(Wrappers.<EnglishStudyLog>lambdaQuery()
                .eq(EnglishStudyLog::getUserId, userId)
                .eq(EnglishStudyLog::getLogType, 2)
                .ge(EnglishStudyLog::getCreatedAt, weekStart));
        int redoCount = redoLogs.size();
        int conquered = extMapper.selectCount(Wrappers.<com.example.backend.english.entity.EnglishWrongExt>lambdaQuery()
                .eq(com.example.backend.english.entity.EnglishWrongExt::getUserId, userId)
                .eq(com.example.backend.english.entity.EnglishWrongExt::getBackflowFlag, 0)
                .ge(com.example.backend.english.entity.EnglishWrongExt::getLastRedoAt, weekStart))
                .intValue();

        // 4. 本周沉淀笔记（私人 Wiki）
        int newNotes = (int) wikiKnowledgeService.listByUser(userId).stream()
                .filter(k -> k.getCreatedAt() != null && k.getCreatedAt().isAfter(weekStart))
                .count();

        Map<String, Object> stats = new HashMap<>();
        stats.put("newWords", newWords);
        stats.put("reviewCount", reviewCount);
        stats.put("reviewCorrect", reviewCorrect);
        stats.put("redoCount", redoCount);
        stats.put("conquered", conquered);
        stats.put("newNotes", newNotes);
        stats.put("totalWords", allWords.size());

        // AI 中文点评（降级：模板文案）
        String summary = buildSummary(stats);
        try {
            summary = agentChatService.chat(
                    "你是英语学习教练。根据本周学习数据，用中文写2到3句鼓励+建议的点评，"
                            + "直接输出纯文本，不要 JSON、不要标题。要点：肯定做得好的，针对薄弱项给一个具体可行的建议。",
                    "本周数据：新收录生词 " + newWords + " 个；复习生词 " + reviewCount + " 次，答对 " + reviewCorrect
                            + " 次；英语错题重做 " + redoCount + " 次，攻克 " + conquered + " 题；沉淀知识笔记 " + newNotes + " 篇。",
                    200);
            summary = summary.trim();
        } catch (Exception e) {
            log.warn("周报 AI 点评生成失败，用模板文案: {}", e.getMessage());
        }
        stats.put("summary", summary);

        res.put("code", 200);
        res.put("data", stats);
        return res;
    }

    /** AI 不可用时的降级点评 */
    private String buildSummary(Map<String, Object> s) {
        int reviews = (int) s.get("reviewCount");
        if (reviews == 0 && (int) s.get("redoCount") == 0) {
            return "这周还没有学习记录，从今天开始复习几个生词吧，坚持一周就能看到明显进步。";
        }
        return "本周复习 " + reviews + " 次、攻克 " + s.get("conquered") + " 道错题，继续保持这个节奏，下周重点补一补还回来的词。";
    }
}
