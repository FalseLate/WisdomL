package com.example.backend.speaking.dto;

import lombok.Data;

@Data
public class UnityChatDTO {
    private String sessionId;
    private String userInput;
    private Boolean mockMode;
    private String characterId;   // 角色档案 id（空=jenny），决定 TTS 音色
    private String mode;          // 功能模式：chat=口语陪练（默认），translate=纯翻译（只出文字，无 TTS）
}