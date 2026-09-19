package com.example.backend.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.backend.dto.WordOptionDTO;
import com.example.backend.entity.UserWord;
import com.example.backend.entity.Word;
import com.example.backend.service.UserWordService;
import com.example.backend.service.WordService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping(("/api/word"))
public class WordController {

    @Resource
    private WordService wordService;
    @Resource
    private UserWordService userWordService;

    // 阅读划词查词：先查词库，查不到时 GLM 兜底出音标释义并动态入库（level=ext），下次命中词库
    @GetMapping("/query")
    public Map<String, Object> queryWord(@RequestParam String text) {
        Map<String, Object> res = new HashMap<>();
        Word word = wordService.findByTextOrFetch(text);
        res.put("code", 200);
        res.put("data", word); // GLM 也查不到（非单词/调用失败）时 data 为 null，前端据此提示未收录
        return res;
    }

    // 随机单词（拼写模式）
    @GetMapping("/random")
    public Map<String, Object> getRandom(@RequestParam(required = false) String level) {
        Map<String, Object> res = new HashMap<>();
        Word word = wordService.getRandomWord(level);
        if(word == null){
            res.put("code",500);
            res.put("msg","当前等级没有单词数据，请导入单词");
            res.put("data",null);
            return res;
        }
        res.put("code", 200);
        res.put("data", word);
        return res;
    }
    // 选择题单词
    @GetMapping("/option")
    public Map<String, Object> getOption(@RequestParam(required = false) String level) {
        Map<String, Object> res = new HashMap<>();
        WordOptionDTO dto = wordService.getWordWithOption(level);
        res.put("code", 200);
        res.put("data", dto);
        return res;
    }

    // 获取我的生词本列表
    @GetMapping("/myCollect")
    public Map<String, Object> myCollect(@RequestParam Long userId) {
        List<Word> list = userWordService.getUserCollectWords(userId);
        Map<String, Object> map = new HashMap<>();
        map.put("code", 200);
        map.put("data", list);
        return map;
    }

    // 取消收藏生词
    @PostMapping("/unCollect")
    public Map<String, Object> unCollect(@RequestBody Map<String, Long> param) {
        Long userId = param.get("userId");
        Long wordId = param.get("wordId");
        userWordService.removeCollect(userId, wordId);
        Map<String, Object> map = new HashMap<>();
        map.put("code", 200);
        map.put("msg", "取消收藏成功");
        return map;
    }



    // 拼写答案校验
    @PostMapping("/check")
    public Map<String, Object> check(@RequestBody Map<String, String> body) {
        Map<String, Object> res = new HashMap<>();
        String answer = body.get("answer").trim();
        String input = body.get("input").trim();
        boolean correct = answer.equalsIgnoreCase(input);
        res.put("code", 200);
        res.put("correct", correct);
        return res;
    }

    // 选择题校验
    @PostMapping("/checkOption")
    public Map<String, Object> checkOption(@RequestBody Map<String, String> body) {
        Map<String, Object> res = new HashMap<>();
        String right = body.get("rightMean");
        String select = body.get("selectMean");
        res.put("code", 200);
        res.put("correct", right.equals(select));
        return res;
    }

    @PostMapping("/collect")
    public Map<String, Object> collect(@RequestBody Map<String, Long> param) {
        Long userId = param.get("userId");
        Long wordId = param.get("wordId");

        LambdaQueryWrapper<UserWord> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(UserWord::getUserId, userId).eq(UserWord::getWordId, wordId);
        long count = userWordService.count(wrapper);

        Map<String, Object> map = new HashMap<>();


        if (count > 0) {
            map.put("code", 400);
            map.put("msg", "该单词已加入生词本");
            return map;
        }
        userWordService.addCollect(userId, wordId);
        map.put("code", 200);
        map.put("msg", "加入生词本成功");
        return map;
    }
    // Excel导入单词
    @PostMapping("/import")
    public Map<String, Object> importWord(MultipartFile file) {
        Map<String, Object> map = new HashMap<>();
        try {
            wordService.importExcel(file);
            map.put("code", 200);
            map.put("msg", "导入成功");
        } catch (Exception e) {
            map.put("code", 500);
            map.put("msg", "导入失败：" + e.getMessage());
        }
        return map;
    }
}