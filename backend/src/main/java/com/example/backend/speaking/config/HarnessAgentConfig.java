package com.example.backend.speaking.config;

import io.agentscope.core.model.GenerateOptions;
import io.agentscope.extensions.model.openai.formatter.OpenAIChatFormatter;
import io.agentscope.extensions.model.openai.OpenAIChatModel;
import io.agentscope.harness.agent.HarnessAgent;
import io.agentscope.harness.agent.memory.compaction.CompactionConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

@Slf4j
@Configuration
public class HarnessAgentConfig {

    @Value("${zhipu.api-key}")
    private String zhipuApiKey;

    @Value("${zhipu.base-url}")
    private String zhipuBaseUrl;

    @Value("${zhipu.model-name}")
    private String modelName;

    @Value("${zhipu.temperature:0.7}")
    private Double temperature;

    @Value("${zhipu.max-tokens:1024}")
    private Integer maxTokens;

    @Value("${agentscope.workspace-path:./workspace-harness}")
    private String workspacePath;

    /**
     * 智谱 GLM-4.6-flash，通过 OpenAI 兼容协议接入
     */
    @Bean
    public OpenAIChatModel zhipuChatModel() {
        return OpenAIChatModel.builder()
                .apiKey(zhipuApiKey)
                .baseUrl(zhipuBaseUrl)
                .modelName(modelName)
                .stream(true)   // 开启流式：HarnessAgent.stream() 的增量事件依赖这里
                .formatter(new OpenAIChatFormatter())
                .generateOptions(
                        GenerateOptions.builder()
                        .temperature(temperature)
                        .maxTokens(maxTokens)
                        // 关闭 GLM 思考模式：glm-4.6v 默认开启 thinking，遇到拼写错误/中文等
                        // "意外输入"时会长时间推理不出首 token，前端表现为请求超时。
                        // 智谱 OpenAI 兼容协议用 thinking.type=disabled 关闭。
                        .additionalBodyParams(Map.of("thinking", Map.of("type", "disabled")))
                        .build())
                .build();
    }

    /**
     * HarnessAgent：企业级有状态 Agent，自带工作区、会话持久化、记忆压缩
     * 注意：2.0 用 .workspace()，不是 .filesystem()
     */
    @Bean
    public HarnessAgent oralPracticeAgent(OpenAIChatModel zhipuChatModel) {
        Path workspace = Paths.get(workspacePath);
        log.info("HarnessAgent workspace path: {}", workspace.toAbsolutePath());

        return HarnessAgent.builder()
                .name("oral-practice-agent")
                // 口语练习提示词：核心约束是「短回复 + 纯文本」——
                // 回复会被逐句送进 edge-tts 朗读，长篇纠错/markdown/emoji 都会拖垮流式链路
                .sysPrompt("""
                        You are Leo, a friendly English speaking-practice partner for a Chinese learner.

                        RESPONSE STYLE (very important):
                        - Keep every reply SHORT: 1-2 sentences, no more than 30 words.
                        - Plain conversational text only. NEVER use markdown, bullet points, \
                        headings, emoji or symbols - the reply is read aloud by a TTS voice.
                        - Reply in English only, simple and natural (CEFR A2-B1 level).
                        - End with at most one short question to keep the conversation going.

                        HANDLING MISTAKES:
                        - If the user's input is misspelled, ungrammatical, or not English, \
                        do NOT give a long correction or lecture.
                        - Just answer naturally using the correct form of what they meant, \
                        and continue the chat.
                        - If they send a single word or something unclear, still reply \
                        briefly and keep it friendly.
                        - Always respond immediately with something; never stay silent.
                        """)
                .model(zhipuChatModel)
                .workspace(workspace)
                .compaction(CompactionConfig.builder()
                        .triggerMessages(30)   // 超过30条触发压缩
                        .keepMessages(10)      // 保留最近10条
                        .build())
                .build();
    }

    /**
     * 故事 Agent：独立于口语陪练——口语提示词约束「短回复」，故事需要完整叙事，
     * 两者共用一个会话会互相带偏。用户可在请求里指定故事类型和长度（中文也行）。
     */
    @Bean
    public HarnessAgent storyAgent(OpenAIChatModel zhipuChatModel) {
        Path workspace = Paths.get(workspacePath);
        return HarnessAgent.builder()
                .name("story-agent")
                .sysPrompt("""
                        You are Leo, a warm English storyteller for a Chinese learner.

                        TASK:
                        - Tell a COMPLETE short story in English based on the user's request.
                        - The user may specify (in Chinese or English) a story TYPE \
                        (adventure, fairy tale, sci-fi, mystery, campus, animals...) \
                        and a LENGTH (word count). Follow their choices exactly.
                        - If type or length is not specified, default: an everyday-life story \
                        of about 120-180 words.

                        STORY STYLE (very important):
                        - Complete arc: a clear beginning, some development, and a real ending. \
                        NEVER stop halfway through the story.
                        - Stay within ±20% of the requested word count.
                        - Mostly CET-4 vocabulary, natural and vivid sentences.
                        - OUTPUT ASCII ONLY: plain English letters, numbers and basic punctuation. \
                        Absolutely NO emoji, NO Chinese characters, NO markdown (# or * symbols), \
                        NO bullet points, NO annotations - the story is read aloud by a TTS voice. \
                        The first line may be a short plain-text story title.

                        The user may write the request in Chinese; the story itself is ALWAYS in English.
                        """)
                .model(zhipuChatModel)
                .workspace(workspace)
                .compaction(CompactionConfig.builder()
                        .triggerMessages(30)
                        .keepMessages(10)
                        .build())
                .build();
    }
}
