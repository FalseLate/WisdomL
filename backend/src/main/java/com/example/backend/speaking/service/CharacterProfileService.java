package com.example.backend.speaking.service;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 角色档案：外观（vrmUrl 由前端管理）+ 音色（TTS 参数）绑定。
 * 第 1 档全部用 edge-tts 免费音色；后续接豆包/GPT-SoVITS 时在 VoiceProfile 加 engine 字段分流。
 * pitch 仅支持 Hz 单位（edge-tts 限制），建议范围 -10Hz ~ +10Hz。
 */
@Service
public class CharacterProfileService {

    /** id=稳定标识（前端传参用），label=下拉显示名 */
    public record VoiceProfile(String id, String label, String voice, String rate, String pitch) {}

    private static final VoiceProfile DEFAULT =
            new VoiceProfile("jenny", "👩‍🏫 温和讲师（Jenny）", "en-US-JennyNeural", "+0%", "+0Hz");

    private static final Map<String, VoiceProfile> PROFILES = Map.of(
            "jenny", DEFAULT,
            "aria",  new VoiceProfile("aria",  "🎀 元气学姐（Aria）", "en-US-AriaNeural", "+8%", "+6Hz"),
            "guy",   new VoiceProfile("guy",   "🕴 沉稳学长（Guy）",  "en-US-GuyNeural",  "+0%", "-4Hz"),
            "ana",   new VoiceProfile("ana",   "🧸 软萌小妹（Ana）",  "en-US-AnaNeural",  "+5%", "+0Hz")
    );

    /** 未知/缺省 id 一律落到 DEFAULT，老客户端不传 characterId 也正常 */
    public VoiceProfile resolve(String id) {
        return PROFILES.getOrDefault(id == null ? "" : id, DEFAULT);
    }

    public List<VoiceProfile> all() {
        return List.of(PROFILES.get("jenny"), PROFILES.get("aria"),
                PROFILES.get("guy"), PROFILES.get("ana"));
    }
}
