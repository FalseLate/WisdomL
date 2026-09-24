package com.example.backend.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.backend.entity.StudySession;
import com.example.backend.entity.UserPlan;
import com.example.backend.entity.Word;
import com.example.backend.entity.WordBook;
import com.example.backend.mapper.StudySessionMapper;
import com.example.backend.mapper.UserPlanMapper;
import com.example.backend.mapper.WordBookMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class StudyService {

    @Resource
    private WordBookMapper wordBookMapper;
    @Resource
    private UserPlanMapper userPlanMapper;
    @Resource
    private StudySessionMapper studySessionMapper;
    @Resource
    private WordService wordService;
    @Resource
    private ObjectMapper objectMapper;

    // ================= 词书 =================

    /** 词书列表，附带每本词书的单词数 */
    public List<Map<String, Object>> getBooks() {
        List<WordBook> books = wordBookMapper.selectList(
                Wrappers.<WordBook>lambdaQuery().orderByAsc(WordBook::getSort));
        List<Map<String, Object>> list = new ArrayList<>();
        for (WordBook book : books) {
            long wordCount = wordService.count(
                    Wrappers.<Word>lambdaQuery().eq(Word::getLevel, book.getLevel()));
            list.add(Map.of(
                    "id", book.getId(),
                    "name", book.getName(),
                    "description", book.getDescription(),
                    "category", book.getCategory(),
                    "level", book.getLevel(),
                    "coverColor", book.getCoverColor(),
                    "wordCount", wordCount
            ));
        }
        return list;
    }

    // ================= 学习计划 =================

    /** 我的当前计划 + 词书信息 + 学习进度（已背/总词数） */
    public Map<String, Object> getMyPlan(Long userId) {
        UserPlan plan = userPlanMapper.selectOne(Wrappers.<UserPlan>lambdaQuery()
                .eq(UserPlan::getUserId, userId)
                .eq(UserPlan::getStatus, "active")
                .orderByDesc(UserPlan::getId)
                .last("limit 1"));
        if (plan == null) {
            return null;
        }
        WordBook book = wordBookMapper.selectOne(Wrappers.<WordBook>lambdaQuery()
                .eq(WordBook::getLevel, plan.getLevel()).last("limit 1"));
        long total = wordService.count(
                Wrappers.<Word>lambdaQuery().eq(Word::getLevel, plan.getLevel()));
        long learned = countLearned(userId, plan.getLevel());
        Map<String, Object> map = new java.util.HashMap<>();
        map.put("plan", plan);
        map.put("book", book);
        map.put("total", total);
        map.put("learned", learned);
        map.put("remaining", Math.max(0, total - learned));
        return map;
    }

    /** 保存（新建或覆盖）学习计划 */
    @Transactional
    public UserPlan savePlan(Long userId, String level, Integer dailyCount) {
        // 同一词书已有效计划则直接更新
        UserPlan plan = userPlanMapper.selectOne(Wrappers.<UserPlan>lambdaQuery()
                .eq(UserPlan::getUserId, userId)
                .eq(UserPlan::getLevel, level)
                .eq(UserPlan::getStatus, "active")
                .last("limit 1"));
        if (plan == null) {
            plan = new UserPlan();
            plan.setUserId(userId);
            plan.setLevel(level);
            plan.setStartDate(LocalDate.now());
        }
        plan.setDailyCount(dailyCount);
        plan.setStatus("active");
        if (plan.getId() == null) {
            userPlanMapper.insert(plan);
        } else {
            userPlanMapper.updateById(plan);
        }
        return plan;
    }

    // ================= 学习（刷题/拼写）会话 =================

    /**
     * 开始一次学习，分配逻辑：
     * 1. 今天该模式有进行中的会话 → 断点续刷
     * 2. 今天该模式已完成 → 追加新的一批（排除已背单词）
     * 3. 今天该模式没学过，但另一模式学过/在学 → 复用今天的单词列表（刷题/拼写内容一致）
     * 4. 今天第一次学 → 按 daily_count 分配新单词
     */
    public Map<String, Object> start(Long userId, String level, String mode) {
        LocalDate today = LocalDate.now();
        List<StudySession> todaySessions = studySessionMapper.selectList(Wrappers.<StudySession>lambdaQuery()
                .eq(StudySession::getUserId, userId)
                .eq(StudySession::getLevel, level)
                .eq(StudySession::getStudyDate, today));

        StudySession session = todaySessions.stream()
                .filter(s -> mode.equals(s.getMode()) && "ongoing".equals(s.getStatus()))
                .findFirst().orElse(null);
        boolean resume = session != null;
        boolean sameWordsAsToday = false;

        if (session == null) {
            // 今天该模式还没学过，但另一模式已有词表 → 复用，保证刷题/拼写内容一致
            // （该模式今天已完成则不再复用，走下面的全新分配 = 追加）
            boolean sameModeToday = todaySessions.stream().anyMatch(s -> mode.equals(s.getMode()));
            List<Long> todayWords = sameModeToday ? null : todaySessions.stream()
                    .filter(s -> s.getWordIds() != null)
                    .sorted(Comparator.comparing(StudySession::getId).reversed())
                    .findFirst()
                    .map(this::parseWordIds)
                    .orElse(null);
            if (todayWords != null && !todayWords.isEmpty()) {
                sameWordsAsToday = true;
                session = createSession(userId, level, mode, today, todayWords);
            } else {
                // 全新一批
                List<Long> batch = allocateWords(userId, level,
                        dailyCountOf(userId, level));
                if (batch.isEmpty()) {
                    return Map.of("finished", true, "words", List.of());
                }
                session = createSession(userId, level, mode, today, batch);
            }
        }

        List<Word> words = loadWords(parseWordIds(session));
        Map<String, Object> res = new java.util.HashMap<>();
        res.put("sessionId", session.getId());
        res.put("resume", resume);
        res.put("sameWordsAsToday", sameWordsAsToday);
        res.put("done", session.getDone());
        res.put("total", session.getTotal());
        res.put("correct", session.getCorrect());
        res.put("words", words);
        return res;
    }

    /** 每答一题上报一次进度（中途退出进度不丢） */
    public Map<String, Object> answer(Long sessionId, boolean correct) {
        StudySession session = studySessionMapper.selectById(sessionId);
        if (session == null) {
            return null;
        }
        session.setDone(session.getDone() + 1);
        if (correct) {
            session.setCorrect(session.getCorrect() + 1);
        }
        studySessionMapper.updateById(session);
        return Map.of("done", session.getDone(), "total", session.getTotal());
    }

    /** 完成会话，返回今天该词书还能不能追加 */
    public Map<String, Object> finish(Long sessionId) {
        StudySession session = studySessionMapper.selectById(sessionId);
        if (session == null) {
            return null;
        }
        session.setStatus("done");
        studySessionMapper.updateById(session);
        long remaining = countRemaining(session.getUserId(), session.getLevel());
        return Map.of("status", "done", "remaining", remaining);
    }

    /** 某词书学习进度（已背 distinct 单词数 / 总数） */
    public Map<String, Object> progress(Long userId, String level) {
        long total = wordService.count(
                Wrappers.<Word>lambdaQuery().eq(Word::getLevel, level));
        long learned = countLearned(userId, level);
        return Map.of("total", total, "learned", learned, "remaining", Math.max(0, total - learned));
    }

    // ================= 私有方法 =================

    private StudySession createSession(Long userId, String level, String mode,
                                       LocalDate date, List<Long> wordIds) {
        StudySession session = new StudySession();
        session.setUserId(userId);
        session.setLevel(level);
        session.setMode(mode);
        session.setStudyDate(date);
        session.setWordIds(toJson(wordIds));
        session.setTotal(wordIds.size());
        session.setDone(0);
        session.setCorrect(0);
        session.setStatus("ongoing");
        studySessionMapper.insert(session);
        return session;
    }

    /** 分配新一批单词：该词书全部单词 - 已背过的，按 id 顺序取前 N 个 */
    private List<Long> allocateWords(Long userId, String level, int count) {
        Set<Long> learned = learnedWordIds(userId, level);
        List<Word> all = wordService.list(Wrappers.<Word>lambdaQuery()
                .eq(Word::getLevel, level).orderByAsc(Word::getId));
        List<Long> batch = new ArrayList<>();
        for (Word w : all) {
            if (batch.size() >= count) {
                break;
            }
            if (!learned.contains(w.getId())) {
                batch.add(w.getId());
            }
        }
        return batch;
    }

    /** 已背单词 id 集合 = 所有已完成会话的 wordIds 并集 */
    private Set<Long> learnedWordIds(Long userId, String level) {
        List<StudySession> doneList = studySessionMapper.selectList(Wrappers.<StudySession>lambdaQuery()
                .eq(StudySession::getUserId, userId)
                .eq(StudySession::getLevel, level)
                .eq(StudySession::getStatus, "done"));
        Set<Long> learned = new LinkedHashSet<>();
        for (StudySession s : doneList) {
            learned.addAll(parseWordIds(s));
        }
        return learned;
    }

    private long countLearned(Long userId, String level) {
        return learnedWordIds(userId, level).size();
    }

    private long countRemaining(Long userId, String level) {
        long total = wordService.count(Wrappers.<Word>lambdaQuery().eq(Word::getLevel, level));
        return Math.max(0, total - countLearned(userId, level));
    }

    private int dailyCountOf(Long userId, String level) {
        UserPlan plan = userPlanMapper.selectOne(Wrappers.<UserPlan>lambdaQuery()
                .eq(UserPlan::getUserId, userId)
                .eq(UserPlan::getLevel, level)
                .eq(UserPlan::getStatus, "active")
                .last("limit 1"));
        return plan != null && plan.getDailyCount() != null ? plan.getDailyCount() : 20;
    }

    private List<Word> loadWords(List<Long> wordIds) {
        if (wordIds.isEmpty()) {
            return List.of();
        }
        List<Word> words = wordService.listByIds(wordIds);
        // 按分配顺序返回
        words.sort(Comparator.comparingInt(w -> wordIds.indexOf(w.getId())));
        return words;
    }

    private List<Long> parseWordIds(StudySession session) {
        try {
            return objectMapper.readValue(session.getWordIds(), new TypeReference<List<Long>>() {});
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private String toJson(List<Long> wordIds) {
        try {
            return objectMapper.writeValueAsString(wordIds);
        } catch (Exception e) {
            return "[]";
        }
    }
}
