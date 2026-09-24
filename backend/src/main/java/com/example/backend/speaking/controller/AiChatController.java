package com.example.backend.speaking.controller;

import lombok.RequiredArgsConstructor;
import com.example.backend.speaking.dto.UnityChatDTO;
import com.example.backend.speaking.service.CharacterProfileService;
import com.example.backend.speaking.service.HarnessChatService;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

import java.util.List;

@RestController
@RequestMapping("/unity/ai")
@RequiredArgsConstructor
public class AiChatController {

    private final HarnessChatService harnessChatService;
    private final CharacterProfileService characterProfiles;

    /** 可用角色音色列表（前端下拉框数据源） */
    @GetMapping("/voices")
    public List<CharacterProfileService.VoiceProfile> voices() {
        return characterProfiles.all();
    }

    /** 流式对话（SSE）：delta 文字增量 / audio 句子音频就绪 / done / error */
    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE + ";charset=UTF-8")
    public Flux<ServerSentEvent<String>> chatStream(@RequestBody UnityChatDTO dto) {
        return harnessChatService.chatStream(dto);
    }
}
