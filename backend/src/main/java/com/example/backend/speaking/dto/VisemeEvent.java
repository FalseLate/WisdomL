package com.example.backend.speaking.dto;

import lombok.Data;

@Data
public class VisemeEvent {
    private Integer visemeId;   // 嘴型编号 0-21
    private Long offset;         // 起始时间（微秒）
    private Long duration;       // 持续时间（微秒）
}
