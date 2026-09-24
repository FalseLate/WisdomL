package com.example.backend.controller;

import com.example.backend.auth.JwtAuth;
import com.example.backend.entity.UserPlan;
import com.example.backend.service.StudyService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/study")
public class StudyController {

    @Resource
    private StudyService studyService;
    @Resource
    private JwtAuth jwtAuth;

    /** 词书列表 */
    @GetMapping("/books")
    public Map<String, Object> books() {
        Map<String, Object> res = new HashMap<>();
        res.put("code", 200);
        res.put("data", studyService.getBooks());
        return res;
    }

    /** 我的当前计划（含词书信息与学习进度） */
    @GetMapping("/plan")
    public Map<String, Object> myPlan() {
        Map<String, Object> res = new HashMap<>();
        Map<String, Object> data = studyService.getMyPlan(jwtAuth.getCurrentUserId());
        res.put("code", 200);
        res.put("data", data); // 可能为 null，表示还没有计划
        return res;
    }

    /** 保存学习计划 */
    @PostMapping("/plan/save")
    public Map<String, Object> savePlan(@RequestBody Map<String, Object> body) {
        Map<String, Object> res = new HashMap<>();
        try {
            Long userId = jwtAuth.getCurrentUserId();
            String level = String.valueOf(body.get("level"));
            Integer dailyCount = Integer.valueOf(String.valueOf(body.get("dailyCount")));
            UserPlan plan = studyService.savePlan(userId, level, dailyCount);
            res.put("code", 200);
            res.put("data", plan);
        } catch (Exception e) {
            res.put("code", 500);
            res.put("msg", "保存失败：" + e.getMessage());
        }
        return res;
    }

    /** 开始学习（分配单词/断点续刷） */
    @PostMapping("/start")
    public Map<String, Object> start(@RequestBody Map<String, String> body) {
        Map<String, Object> res = new HashMap<>();
        try {
            Long userId = jwtAuth.getCurrentUserId();
            String level = body.get("level");
            String mode = body.get("mode"); // choice / spell
            res.put("code", 200);
            res.put("data", studyService.start(userId, level, mode));
        } catch (Exception e) {
            res.put("code", 500);
            res.put("msg", e.getMessage());
        }
        return res;
    }

    /** 每答一题上报进度 */
    @PostMapping("/answer")
    public Map<String, Object> answer(@RequestBody Map<String, Object> body) {
        Map<String, Object> res = new HashMap<>();
        Long sessionId = Long.valueOf(String.valueOf(body.get("sessionId")));
        boolean correct = Boolean.parseBoolean(String.valueOf(body.get("correct")));
        Map<String, Object> data = studyService.answer(sessionId, correct);
        res.put("code", 200);
        res.put("data", data);
        return res;
    }

    /** 完成本组学习 */
    @PostMapping("/finish")
    public Map<String, Object> finish(@RequestBody Map<String, Object> body) {
        Map<String, Object> res = new HashMap<>();
        Long sessionId = Long.valueOf(String.valueOf(body.get("sessionId")));
        Map<String, Object> data = studyService.finish(sessionId);
        res.put("code", 200);
        res.put("data", data);
        return res;
    }

    /** 词书学习进度 */
    @GetMapping("/progress")
    public Map<String, Object> progress(@RequestParam String level) {
        Map<String, Object> res = new HashMap<>();
        res.put("code", 200);
        res.put("data", studyService.progress(jwtAuth.getCurrentUserId(), level));
        return res;
    }
}
