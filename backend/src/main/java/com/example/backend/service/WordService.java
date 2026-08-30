package com.example.backend.service;

import com.alibaba.excel.EasyExcel;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.example.backend.dto.WordExcelDTO;
import com.example.backend.dto.WordOptionDTO;
import com.example.backend.entity.Word;
import com.example.backend.mapper.WordMapper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.stream.Collectors;



@Service
public class WordService extends ServiceImpl<WordMapper, Word> {

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