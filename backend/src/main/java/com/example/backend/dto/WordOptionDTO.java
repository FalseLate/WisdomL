package com.example.backend.dto;

import lombok.Data;

import java.util.List;

@Data
public class WordOptionDTO {
    private Long id;
    private String word;
    private String phonetic;
    private String cnMean;
    private String sentence;
    private List<String> options;
}
