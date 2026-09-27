package com.example.backend.speaking.service;

import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.event.AgentEventType;
import io.agentscope.core.event.TextBlockDeltaEvent;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.SystemMessage;
import io.agentscope.core.message.TextBlock;
import io.agentscope.core.message.UserMessage;
import io.agentscope.core.model.ChatResponse;
import io.agentscope.core.model.GenerateOptions;
import io.agentscope.extensions.model.openai.OpenAIChatModel;
import io.agentscope.harness.agent.HarnessAgent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.example.backend.speaking.dto.UnityChatDTO;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Map;

/**
 * LLM 调用路由层：按 mode 切换模型用法
 * - chat：有状态 HarnessAgent（口语陪练，按 sessionId 记忆会话）
 * - story：有状态 HarnessAgent（讲故事，会话记忆独立于 chat）
 * - translate：无状态一次性调用（纯翻译，不进会话记忆，不触发 TTS/虚拟人动作）
 * 上游（HarnessChatService）只认 Flux&lt;String&gt; 文本增量，不关心底层是哪条链路。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LlmService {

    public static final String MODE_CHAT = "chat";
    public static final String MODE_TRANSLATE = "translate";
    public static final String MODE_STORY = "story";

    private final HarnessAgent oralPracticeAgent;
    private final HarnessAgent storyAgent;
    private final OpenAIChatModel zhipuChatModel;

    /** 翻译系统提示词：中英互译，只输出译文，不闲聊 */
    private static final String TRANSLATE_SYS_PROMPT = """
            You are a professional translator. Translate between Chinese and English automatically:
            Chinese input -> English translation; English input -> Chinese translation.
            Output ONLY the translation. No explanations, no notes, no small talk, no quotation marks.
            """;

    /** mode 归一化：空/未知一律视为 chat */
    public String normalizeMode(String mode) {
        if (MODE_TRANSLATE.equalsIgnoreCase(mode)) return MODE_TRANSLATE;
        if (MODE_STORY.equalsIgnoreCase(mode)) return MODE_STORY;
        return MODE_CHAT;
    }

    /** 翻译模式不朗读、不驱动虚拟人，chat/story（及未知）模式正常走 TTS */
    public boolean ttsEnabled(String mode) {
        return !MODE_TRANSLATE.equals(normalizeMode(mode));
    }

    /** 按 mode 路由 LLM 调用，统一返回文本增量流 */
    public Flux<String> chatStream(UnityChatDTO dto) {
        String mode = normalizeMode(dto.getMode());
        if (MODE_TRANSLATE.equals(mode)) {
            return translateStream(dto.getUserInput());
        }
        if (MODE_STORY.equals(mode)) {
            // 故事会话在 sessionId 后加后缀，和口语陪练的会话记忆互相隔离
            // 故事流额外过滤非 ASCII：GLM 偶发在破折号/emoji 处吐出 GBK 乱码（锟/替换符），
            // 故事本身要求纯英文文本，直接丢弃非 ASCII 字符兜底（translate 需要中文，不过滤）
            return agentStream(storyAgent, dto.getSessionId() + "-story", dto.getUserInput())
                    .map(delta -> delta.replaceAll("[^\\x20-\\x7E\\n\\r\\t]", ""));
        }
        return agentStream(oralPracticeAgent, dto.getSessionId(), dto.getUserInput());
    }

    /** 有状态 HarnessAgent，按 sessionId 记忆会话 */
    private Flux<String> agentStream(HarnessAgent agent, String sessionId, String userInput) {
        RuntimeContext context = RuntimeContext.builder().sessionId(sessionId).build();
        return agent
                .streamEvents(new UserMessage(userInput), context)
                .filter(e -> e.getType() == AgentEventType.TEXT_BLOCK_DELTA)
                .map(e -> ((TextBlockDeltaEvent) e).getDelta());
    }

    /**
     * translate：无状态单次调用。不走 HarnessAgent——翻译不需要记忆，
     * 也避免翻译内容混进口语陪练的会话历史里带偏后续对话。
     */
    public Flux<String> translateStream(String userInput) {
        List<Msg> messages = List.of(
                new SystemMessage(TRANSLATE_SYS_PROMPT),
                new UserMessage(userInput));
        return zhipuChatModel.stream(messages, List.of(), translateOptions())
                // 流式响应里每个 ChatResponse 携带一段 TextBlock 增量，抽取纯文本
                .flatMapIterable(LlmService::extractText);
    }

    private static List<String> extractText(ChatResponse resp) {
        return resp.getContent().stream()
                .filter(TextBlock.class::isInstance)
                .map(b -> ((TextBlock) b).getText())
                .filter(s -> !s.isEmpty())
                .toList();
    }

    /** 翻译用低温（忠实原文）+ 关闭思考模式（与 HarnessAgentConfig 同款，防中文短句卡思考超时） */
    private GenerateOptions translateOptions() {
        return GenerateOptions.builder()
                .temperature(0.3)
                .maxTokens(1024)
                .additionalBodyParams(Map.of("thinking", Map.of("type", "disabled")))
                .build();
    }
}
