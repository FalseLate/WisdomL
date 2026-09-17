package com.example.backend.speaking.dto;

import lombok.Data;
import java.util.List;

@Data
public class TTSResult {
    private byte[] audioData;         // mp3 音频字节
    private List<VisemeEvent> viseme; // 口型序列（带时间戳）
}
