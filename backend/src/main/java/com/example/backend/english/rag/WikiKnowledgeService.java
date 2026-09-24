package com.example.backend.english.rag;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 轻量 RAG：只做检索匹配，给 Agent 提供学情上下文；不修改任何 Wiki 表（写操作归 Agent/Act 阶段）。
 * 向量存 MySQL embedding_json，检索时内存余弦相似度 top-k——语料为短句级（千条以内），毫秒级完成。
 * 检索优先级（阶段2/3 实现）：用户私人Wiki > 公共Wiki > 通用阅读素材。
 */
@Service
public class WikiKnowledgeService {

    private static final Logger log = LoggerFactory.getLogger(WikiKnowledgeService.class);

    @Value("${rag.enabled:true}")
    private boolean ragEnabled;

    @Value("${rag.top-k:5}")
    private int defaultTopK;

    @Resource
    private WikiKnowledgeMapper knowledgeMapper;

    @Resource
    private EmbeddingService embeddingService;

    @Resource
    private ObjectMapper objectMapper;

    /** RAG 是否可用（降级开关） */
    public boolean isAvailable() {
        return ragEnabled;
    }

    /**
     * 语义检索 top-k（公共知识，兼容旧调用方）。
     * embedding 不可用（额度耗尽/接口异常）时自动降级为关键词重合度打分，保证检索始终有结果。
     */
    public List<SearchHit> search(String query, Integer knowledgeType, int topK) {
        return search(query, knowledgeType, topK, null);
    }

    /**
     * 语义检索 top-k，userId 非空时私人条目优先于公共条目（阶段3 Act：私人 Wiki 沉淀生效）。
     * @param query 查询文本（如：用户薄弱词、错题题干、知识点关键词）
     * @param knowledgeType 知识类型过滤，null 不限
     * @param topK 返回条数，<=0 用默认值
     * @param userId 当前用户，null 只搜公共
     * @return 命中条目及相似度；RAG 关闭时返回空列表（调用方按降级模式处理）
     */
    public List<SearchHit> search(String query, Integer knowledgeType, int topK, Long userId) {
        if (!ragEnabled || query == null || query.isBlank()) {
            return List.of();
        }
        int k = topK > 0 ? topK : defaultTopK;

        // 语义向量优先，失败降级关键词打分
        float[] queryVec = null;
        try {
            queryVec = embeddingService.embed(query);
        } catch (Exception e) {
            log.warn("embedding 不可用，降级为关键词检索: {}", e.getMessage());
        }

        LambdaQueryWrapper<WikiKnowledge> wrapper = Wrappers.lambdaQuery();
        if (userId != null) {
            // 公共种子 + 我的私人沉淀一起进候选
            wrapper.and(w -> w.isNull(WikiKnowledge::getUserId).or().eq(WikiKnowledge::getUserId, userId));
        } else {
            wrapper.isNull(WikiKnowledge::getUserId);
        }
        if (knowledgeType != null) {
            wrapper.eq(WikiKnowledge::getKnowledgeType, knowledgeType);
        }
        List<WikiKnowledge> candidates = knowledgeMapper.selectList(wrapper);

        List<SearchHit> hits = new ArrayList<>();
        for (WikiKnowledge item : candidates) {
            double score;
            if (queryVec != null) {
                float[] vec = ensureEmbedding(item);
                if (vec == null) continue;
                score = cosine(queryVec, vec);
            } else {
                score = keywordScore(query, item);
                if (score <= 0) continue;
            }
            hits.add(new SearchHit(item, score));
        }
        // 私人沉淀优先（同相关度时更懂用户），再按相似度降序
        hits.sort(Comparator
                .comparing((SearchHit h) -> h.knowledge().getUserId() != null ? 0 : 1)
                .thenComparing(Comparator.comparingDouble(SearchHit::getScore).reversed()));
        List<SearchHit> top = hits.subList(0, Math.min(k, hits.size()));
        countHits(top);
        return top;
    }

    /** 阶段4 反哺公共库：私人条目每被检索命中一次计数+1，满 5 次说明对大家都有用，自动升级为公共条目 */
    private void countHits(List<SearchHit> top) {
        for (SearchHit hit : top) {
            WikiKnowledge k = hit.knowledge();
            if (k.getUserId() == null) continue;
            try {
                int newCount = (k.getHitCount() == null ? 0 : k.getHitCount()) + 1;
                WikiKnowledge update = new WikiKnowledge();
                update.setId(k.getId());
                update.setHitCount(newCount);
                if (newCount >= 5) {
                    update.setUserId(null);   // 升级为公共（MyBatis-Plus 默认跳过 null，需 UpdateWrapper 置空）
                    knowledgeMapper.update(null, Wrappers.<WikiKnowledge>lambdaUpdate()
                            .eq(WikiKnowledge::getId, k.getId())
                            .set(WikiKnowledge::getUserId, null)
                            .set(WikiKnowledge::getHitCount, newCount));
                    log.info("私人知识点[{}] 命中{}次，已反哺为公共条目", k.getTitle(), newCount);
                    k.setUserId(null);
                } else {
                    knowledgeMapper.updateById(update);
                }
                k.setHitCount(newCount);
            } catch (Exception e) {
                log.warn("命中计数失败 id={}: {}", k.getId(), e.getMessage());
            }
        }
    }

    /**
     * 关键词重合度打分（embedding 降级模式）：
     * 英文按单词、中文按单字提取查询词元，命中比例作为得分。
     */
    public static double keywordScore(String query, WikiKnowledge item) {
        List<String> tokens = tokenize(query);
        if (tokens.isEmpty()) return 0;
        String hay = (item.getTitle() + " " + item.getContent() + " " + item.getExampleSentence()).toLowerCase();
        long hit = tokens.stream().filter(hay::contains).count();
        return (double) hit / tokens.size();
    }

    /** 英文单词 + 中文单字混合分词 */
    public static List<String> tokenize(String text) {
        List<String> tokens = new ArrayList<>();
        if (text == null) return tokens;
        for (String en : text.toLowerCase().split("[^a-z']+")) {
            if (en.length() >= 2) tokens.add(en);
        }
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c >= 0x4E00 && c <= 0x9FFF) tokens.add(String.valueOf(c));
        }
        return tokens;
    }

    /** 懒生成向量：embedding_json 为空时调智谱接口计算并回写；失败返回 null 不阻断其余候选 */
    private float[] ensureEmbedding(WikiKnowledge item) {
        if (item.getEmbeddingJson() != null && !item.getEmbeddingJson().isBlank()) {
            try {
                return objectMapper.readValue(item.getEmbeddingJson(), float[].class);
            } catch (Exception e) {
                // JSON 损坏则重算
            }
        }
        try {
            String text = item.getTitle() + " " + (item.getContent() == null ? "" : item.getContent())
                    + " " + (item.getExampleSentence() == null ? "" : item.getExampleSentence());
            float[] vec = embeddingService.embed(text);
            item.setEmbeddingJson(objectMapper.writeValueAsString(vec));
            WikiKnowledge update = new WikiKnowledge();
            update.setId(item.getId());
            update.setEmbeddingJson(item.getEmbeddingJson());
            knowledgeMapper.updateById(update);
            return vec;
        } catch (Exception e) {
            log.warn("知识点[{}] 向量化失败: {}", item.getTitle(), e.getMessage());
            return null;
        }
    }

    /** 余弦相似度 */
    public static double cosine(float[] a, float[] b) {
        if (a.length != b.length) return 0;
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += (double) a[i] * b[i];
            na += (double) a[i] * a[i];
            nb += (double) b[i] * b[i];
        }
        return na == 0 || nb == 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
    }

    /** 检索命中：知识点 + 相似度分 */
    public record SearchHit(WikiKnowledge knowledge, double score) {
        public double getScore() { return score; }
    }

    /**
     * 把 AI 提炼的知识点沉淀为用户私人条目（同用户同标题去重）。
     * @return 落库后的条目 id；重复时返回已存在条目的 id
     */
    public long absorb(Long userId, WikiKnowledge item) {
        WikiKnowledge exist = knowledgeMapper.selectOne(Wrappers.<WikiKnowledge>lambdaQuery()
                .eq(WikiKnowledge::getUserId, userId)
                .eq(WikiKnowledge::getTitle, item.getTitle())
                .last("LIMIT 1"));
        if (exist != null) return exist.getId();
        item.setUserId(userId);
        item.setEmbeddingJson(null);   // 向量留待首次检索时懒生成
        knowledgeMapper.insert(item);
        return item.getId();
    }

    /** 某用户的私人条目（新的沉淀在前） */
    public List<WikiKnowledge> listByUser(Long userId) {
        return knowledgeMapper.selectList(Wrappers.<WikiKnowledge>lambdaQuery()
                .eq(WikiKnowledge::getUserId, userId)
                .orderByDesc(WikiKnowledge::getId));
    }

    public WikiKnowledge getById(long id) {
        return knowledgeMapper.selectById(id);
    }

    public void removeById(long id) {
        knowledgeMapper.deleteById(id);
    }
}
