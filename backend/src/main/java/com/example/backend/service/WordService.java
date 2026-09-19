package com.example.backend.service;

import com.alibaba.excel.EasyExcel;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.example.backend.dto.WordExcelDTO;
import com.example.backend.dto.WordOptionDTO;
import com.example.backend.entity.Word;
import com.example.backend.mapper.WordMapper;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.TextBlock;
import io.agentscope.core.model.GenerateOptions;
import io.agentscope.extensions.model.openai.OpenAIChatModel;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.stream.Collectors;



@Service
public class WordService extends ServiceImpl<WordMapper, Word> {

    @Resource
    private OpenAIChatModel zhipuChatModel; // 阅读划词兜底：词库缺词时问 GLM

    // 根据等级随机取单词 level: CET4 / CET6 / null全部
    public Word getRandomWord(String level) {
        LambdaQueryWrapper<Word> wrapper = Wrappers.lambdaQuery();
        if (level != null && !level.trim().isEmpty()) {
            wrapper.eq(Word::getLevel, level);
        }
        List<Word> list = this.list(wrapper);
        if (list.isEmpty()) {
            return null;
        }
        Random random = new Random();
        return list.get(random.nextInt(list.size()));
    }

    // 阅读划词：按单词文本精确查询（表排序规则不区分大小写，前端已去标点转小写）
    public Word findByText(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        return this.getOne(Wrappers.<Word>lambdaQuery().eq(Word::getWord, text.trim().toLowerCase()).last("LIMIT 1"));
    }

    // 阅读划词兜底：词库没有的词让 GLM 出音标+释义，动态入库（level=ext），下次命中
    public Word findByTextOrFetch(String text) {
        String token = text == null ? "" : text.trim().toLowerCase();
        if (!token.matches("[a-z'’-]{1,40}")) {
            return null;
        }
        Word word = findByText(token);
        if (word != null) {
            return word;
        }
        try {
            String prompt = "查这个英文单词：" + token + "。只输出一个 JSON 对象（无 markdown、无多余文字）："
                    + "{\"phonetic\":\"音标（含 //）\",\"cnMean\":\"词性缩写.中文释义（一行，最多两义）\"}";
            List<Msg> messages = List.of(
                    new io.agentscope.core.message.SystemMessage(
                            "你是英汉词典。只输出 JSON 对象本身，禁止 markdown 代码块和多余文字。"),
                    new io.agentscope.core.message.UserMessage(prompt));

            GenerateOptions options = GenerateOptions.builder()
                    .temperature(0.2)
                    .maxTokens(120)
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
                    .blockLast(Duration.ofSeconds(30));
            String raw = sb.toString().trim();
            int start = raw.indexOf('{');
            int end = raw.lastIndexOf('}');
            if (start < 0 || end <= start) {
                return null;
            }
            Map<?, ?> obj = new com.fasterxml.jackson.databind.ObjectMapper()
                    .readValue(raw.substring(start, end + 1), Map.class);
            Object ph = obj.get("phonetic");
            Object cm = obj.get("cnMean");
            String phonetic = ph == null ? "" : String.valueOf(ph);
            String cnMean = cm == null ? "" : String.valueOf(cm);
            if (phonetic.isBlank() || cnMean.isBlank()) {
                return null;
            }
            Word created = new Word();
            created.setWord(token);
            created.setPhonetic(phonetic);
            created.setCnMean(cnMean);
            created.setLevel("ext");
            created.setCreateTime(LocalDateTime.now());
            this.save(created);
            return created;
        } catch (Exception e) {
            return null;
        }
    }

    // 获取单词+选择题干扰选项
    public WordOptionDTO getWordWithOption(String level) {
        LambdaQueryWrapper<Word> wrapper = Wrappers.lambdaQuery();
        if (level != null && !level.trim().isEmpty()) {
            wrapper.eq(Word::getLevel, level);
        }
        List<Word> allList = this.list(wrapper);
        if (allList.isEmpty()) {
            return null;
        }
        Random random = new Random();
        Word target = allList.get(random.nextInt(allList.size()));

        WordOptionDTO dto = new WordOptionDTO();
        dto.setId(target.getId());
        dto.setWord(target.getWord());
        dto.setPhonetic(target.getPhonetic());
        dto.setCnMean(target.getCnMean());
        dto.setSentence(target.getSentence());

        List<String> allMeans = allList.stream().map(Word::getCnMean).collect(Collectors.toList());
        allMeans.remove(target.getCnMean());
        Collections.shuffle(allMeans);

        List<String> opts = new ArrayList<>();
        opts.add(target.getCnMean());
        for (int i = 0; i < 3 && i < allMeans.size(); i++) {
            opts.add(allMeans.get(i));
        }
        Collections.shuffle(opts);
        dto.setOptions(opts);
        return dto;
    }

    // Excel批量导入单词
    public void importExcel(MultipartFile file) throws Exception {
        // ========== 新增：校验文件后缀，只允许 .xlsx ==========
        String fileName = file.getOriginalFilename();
        if (fileName == null || !fileName.endsWith(".xlsx")) {
            throw new Exception("仅支持上传 .xlsx 格式Excel文件，不支持xls、其他格式");
        }


        InputStream is = file.getInputStream();
        List<WordExcelDTO> dataList = EasyExcel.read(is)
                .head(WordExcelDTO.class)
                .headRowNumber(1)
                .sheet()
                .doReadSync();

        List<Word> saveList = new ArrayList<>();
        for (WordExcelDTO dto : dataList) {
            // 可选：简单非空校验，避免脏数据入库
            if (dto.getWord() == null || dto.getWord().trim().isEmpty()) {
                continue;
            }
            Word word = new Word();
            word.setWord(dto.getWord());
            word.setPhonetic(dto.getPhonetic());
            word.setCnMean(dto.getCnMean());
            word.setSentence(dto.getSentence());
            word.setLevel(dto.getLevel());
            word.setCreateTime(LocalDateTime.now()); // 补上创建时间！
            saveList.add(word);
        }
        // MyBatis-Plus自带saveBatch
        this.saveBatch(saveList);
    }
}