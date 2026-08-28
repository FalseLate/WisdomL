package com.example.backend.dto;

import com.alibaba.excel.annotation.ExcelProperty;
import lombok.Data;

@Data
public class WordExcelDTO {
    @ExcelProperty(index = 0)
    private String word;

    @ExcelProperty(index = 1)
    private String phonetic;

    @ExcelProperty(index = 2)
    private String cnMean;

    @ExcelProperty(index = 3)
    private String sentence;

    @ExcelProperty(index = 4)
    private String level;
}