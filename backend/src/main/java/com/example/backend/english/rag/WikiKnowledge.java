package com.example.backend.english.rag;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

/**
 * Wiki根系知识库：全局英语知识点、分级例句、策略模板（user_id 为空即公共种子）。
 * 阶段3 Act：错题由 AI 提炼写入该用户名下的私人条目，检索时私人优先于公共。
 * 只存短句/知识点级素材，不存长文章 chunk；向量在首次检索时懒生成。
 */
@TableName("wiki_public_knowledge")
public class WikiKnowledge {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;             // NULL=公共知识；非 NULL=该用户的私人沉淀
    private Integer knowledgeType;   // 1单词 2短语 3语法 4阅读解题策略
    private String title;
    private String content;
    private String exampleSentence;  // 多条例句以换行分隔
    private String errorTypeIds;     // 绑定错因标签，逗号分隔1-5
    private Integer level;           // 难度1-5
    private String embeddingJson;    // 向量化JSON数组
    private Integer hitCount;        // 私人条目被检索命中次数，达阈值自动升级为公共
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Integer getKnowledgeType() { return knowledgeType; }
    public void setKnowledgeType(Integer knowledgeType) { this.knowledgeType = knowledgeType; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getExampleSentence() { return exampleSentence; }
    public void setExampleSentence(String exampleSentence) { this.exampleSentence = exampleSentence; }
    public String getErrorTypeIds() { return errorTypeIds; }
    public void setErrorTypeIds(String errorTypeIds) { this.errorTypeIds = errorTypeIds; }
    public Integer getLevel() { return level; }
    public void setLevel(Integer level) { this.level = level; }
    public String getEmbeddingJson() { return embeddingJson; }
    public void setEmbeddingJson(String embeddingJson) { this.embeddingJson = embeddingJson; }
    public Integer getHitCount() { return hitCount; }
    public void setHitCount(Integer hitCount) { this.hitCount = hitCount; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
