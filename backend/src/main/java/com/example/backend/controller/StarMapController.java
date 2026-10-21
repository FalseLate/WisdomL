package com.example.backend.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.backend.auth.JwtAuth;
import com.example.backend.entity.*;
import com.example.backend.mapper.*;
import com.example.backend.service.StarMapAiService;
import com.example.backend.service.StarMapSupport;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.*;

/**
 * 知识星图（用户自己拥有的知识图）。接口前缀 /api/starmap
 *
 * 三条口径写在代码注释里，改数据模型前先读：
 *   层级线不落表（由 starmap_point.topic_id + hier_line 派生），删线不等于脱离主题
 *   共现线不落表（由 starmap_point_ref 现算），被 starmap_veto 否决的对不再出现
 *   语义线落 starmap_edge，AI 只写 candidate，用户确认才变 accepted
 */
@RestController
@RequestMapping("/api")
public class StarMapController {

    private static final Logger log = LoggerFactory.getLogger(StarMapController.class);
    private static final ObjectMapper mapper = new ObjectMapper();
    /** refs 一次给全的量上限，超了就只给最近的并置 meta.refsTruncated */
    private static final int REF_LIMIT = 3000;

    @Autowired(required = false) private StarmapTopicMapper topicMapper;
    @Autowired(required = false) private StarmapGalaxyMapper galaxyMapper;
    @Autowired(required = false) private StarmapPointMapper pointMapper;
    @Autowired(required = false) private StarmapPointRefMapper refMapper;
    @Autowired(required = false) private StarmapEdgeMapper edgeMapper;
    @Autowired(required = false) private StarmapVetoMapper vetoMapper;
    @Autowired(required = false) private StarmapStyleMapper styleMapper;
    @Autowired(required = false) private StarmapAiPointMapper aiPointMapper;
    @Autowired(required = false) private UserWrongQuestionMapper wrongQuestionMapper;
    @Autowired(required = false) private JwtAuth jwtAuth;
    @Autowired private StarMapAiService aiService;
    @Autowired private TaskManager taskManager;

    // ============================ 整张图 ============================

    @GetMapping("/starmap/graph")
    public Map<String, Object> graph() {
        Long userId = getCurrentUserId();
        Map<String, Object> out = new LinkedHashMap<>();
        if (topicMapper == null) {
            out.put("topics", List.of()); out.put("galaxies", List.of()); out.put("points", List.of()); out.put("edges", List.of());
            out.put("candidates", List.of()); out.put("pointCandidates", List.of());
            out.put("refs", List.of()); out.put("styles", Map.of()); out.put("vetoes", List.of());
            out.put("meta", Map.of("refsTruncated", false));
            return out;
        }
        List<StarmapTopic> topics = ownedTopics(userId);
        List<StarmapPoint> points = ownedPoints(userId);
        Set<Long> pointIds = new HashSet<>();
        for (StarmapPoint p : points) pointIds.add(p.getId());

        out.put("topics", topics.stream().map(this::topicMap).toList());
        out.put("galaxies", ownedGalaxies(userId).stream().map(this::galaxyMap).toList());
        out.put("points", points.stream().map(this::pointMap).toList());
        out.put("edges", acceptedEdges(userId, pointIds));
        out.put("candidates", candidateEdges(userId, pointIds));
        out.put("pointCandidates", pendingCandidates(userId, pointIds));
        out.put("refs", refsOf(userId, pointIds));
        out.put("styles", stylesOf(userId));
        out.put("vetoes", vetoesOf(userId));
        out.put("meta", Map.of("refsTruncated", false));
        return out;
    }

    private List<Map<String, Object>> refsOf(Long userId, Set<Long> pointIds) {
        if (refMapper == null) return List.of();
        List<StarmapPointRef> all = refMapper.selectList(new LambdaQueryWrapper<StarmapPointRef>()
            .eq(StarmapPointRef::getUserId, userId)
            .orderByDesc(StarmapPointRef::getId)
            .last("limit " + REF_LIMIT));
        Map<Long, List<Long>> byQuestion = new LinkedHashMap<>();
        for (StarmapPointRef r : all) {
            if (!pointIds.contains(r.getPointId())) continue;
            byQuestion.computeIfAbsent(r.getWrongQuestionId(), k -> new ArrayList<>()).add(r.getPointId());
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<Long, List<Long>> e : byQuestion.entrySet()) {
            UserWrongQuestion wq = wrongQuestionMapper == null ? null : wrongQuestionMapper.selectById(e.getKey());
            List<Long> ids = new ArrayList<>(new TreeSet<>(e.getValue()));
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("q", e.getKey());
            row.put("k", ids);
            row.put("et", wq == null || wq.getErrorTypes() == null ? List.of() : Arrays.asList(wq.getErrorTypes().split(",")));
            row.put("st", wq == null ? 0 : wq.getStatus());
            row.put("wc", wq == null || wq.getWrongCount() == null ? 1 : wq.getWrongCount());
            row.put("txt", wq == null ? "" : questionSnippet(wq.getQuestionContent()));
            out.add(row);
        }
        return out;
    }

    private List<Map<String, Object>> acceptedEdges(Long userId, Set<Long> pointIds) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (edgeMapper == null) return out;
        for (StarmapEdge e : edgesWithStatus(userId, "accepted")) {
            if (!endpointExists(e.getFromPoint(), e.getFromKind(), pointIds)) continue;
            out.add(edgeMap(e));
        }
        return out;
    }

    private List<Map<String, Object>> candidateEdges(Long userId, Set<Long> pointIds) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (edgeMapper == null) return out;
        for (StarmapEdge e : edgesWithStatus(userId, "candidate")) {
            if (!endpointExists(e.getFromPoint(), e.getFromKind(), pointIds)
                || !endpointExists(e.getToPoint(), e.getToKind(), pointIds)) continue;
            out.add(edgeMap(e));
        }
        return out;
    }

    private List<StarmapEdge> edgesWithStatus(Long userId, String status) {
        return edgeMapper.selectList(new LambdaQueryWrapper<StarmapEdge>()
            .eq(StarmapEdge::getUserId, userId)
            .eq(StarmapEdge::getStatus, status)
            .orderByAsc(StarmapEdge::getId));
    }

    private boolean endpointExists(Long id, String kind, Set<Long> pointIds) {
        if (id == null) return false;
        if ("topic".equals(kind)) return topicMapper.selectById(id) != null;
        return pointIds.contains(id);
    }

    private List<Map<String, Object>> pendingCandidates(Long userId, Set<Long> pointIds) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (aiPointMapper == null) return out;
        List<StarmapAiPoint> rows = aiPointMapper.selectList(new LambdaQueryWrapper<StarmapAiPoint>()
            .eq(StarmapAiPoint::getUserId, userId)
            .eq(StarmapAiPoint::getStatus, "pending")
            .orderByDesc(StarmapAiPoint::getId)
            .last("limit 200"));
        for (StarmapAiPoint c : rows) {
            if (StarMapAiService.isMetaTitle(c.getTitle())) continue;
            UserWrongQuestion wq = wrongQuestionMapper == null ? null : wrongQuestionMapper.selectById(c.getWrongQuestionId());
            if (wq != null && !Objects.equals(wq.getUserId(), userId)) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("wrongQuestionId", c.getWrongQuestionId());
            m.put("title", c.getTitle());
            m.put("reason", c.getReason());
            m.put("conf", c.getConf());
            m.put("qText", wq == null ? "" : questionSnippet(wq.getQuestionContent()));
            out.add(m);
        }
        return out;
    }

    private Map<String, Object> stylesOf(Long userId) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (styleMapper == null) return out;
        for (StarmapStyle s : styleMapper.selectList(new LambdaQueryWrapper<StarmapStyle>()
            .eq(StarmapStyle::getUserId, userId))) {
            try {
                out.put(s.getTargetKey(), mapper.readValue(s.getStyleJson(), new TypeReference<Map<String, Object>>() {}));
            } catch (Exception e) {
                log.warn("星图外观配置解析失败 id={}: {}", s.getId(), e.getMessage());
            }
        }
        return out;
    }

    private List<Map<String, Object>> vetoesOf(Long userId) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (vetoMapper == null) return out;
        for (StarmapVeto v : vetoMapper.selectList(new LambdaQueryWrapper<StarmapVeto>()
            .eq(StarmapVeto::getUserId, userId))) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("kind", v.getKind());
            m.put("aPoint", v.getPointA());
            m.put("bPoint", v.getPointB());
            m.put("aKey", v.getKeyA());
            m.put("bKey", v.getKeyB());
            m.put("aTitle", v.getTitleA());
            m.put("bTitle", v.getTitleB());
            out.add(m);
        }
        return out;
    }

    // ============================ 主题（大球） ============================

    @PostMapping("/starmap/topic")
    public Map<String, Object> addTopic(@RequestBody Map<String, Object> body) {
        Long userId = getCurrentUserId();
        String title = str(body.get("title"));
        if (title.isBlank()) throw new RuntimeException("主题名字不能为空");
        StarmapTopic t = new StarmapTopic();
        t.setUserId(userId);
        t.setTitle(cut(title, 100));
        t.setNote(cut(str(body.get("note")), 1000));
        Long galaxyId = toLong(body.get("galaxyId"));
        if (galaxyId != null) {
            StarmapGalaxy g = ownedGalaxy(galaxyId);
            if (g == null) throw new RuntimeException("星系不存在或不属于你");
            t.setGalaxyId(galaxyId);
        }
        String color = str(body.get("color"));
        if (!color.isBlank()) t.setColor(cut(color, 40));
        topicMapper.insert(t);
        return Map.of("id", t.getId());
    }

    @PutMapping("/starmap/topic/{id:\\d+}")
    public Map<String, Object> updateTopic(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        StarmapTopic t = ownedTopic(id);
        if (t == null) return Map.of("success", false);
        if (body.containsKey("title")) {
            String title = str(body.get("title"));
            if (!title.isBlank()) t.setTitle(cut(title, 100));
        }
        if (body.containsKey("note")) t.setNote(cut(str(body.get("note")), 1000));
        if (body.containsKey("color")) t.setColor(nullToBlank(str(body.get("color"))));
        if (body.containsKey("galaxyId")) {
            Long galaxyId = toLong(body.get("galaxyId"));
            if (galaxyId != null && ownedGalaxy(galaxyId) == null) throw new RuntimeException("星系不存在或不属于你");
            t.setGalaxyId(galaxyId);
        }
        Object pin = body.get("pin");
        if (pin == null && body.containsKey("pin")) {
            t.setPinX(null); t.setPinY(null); t.setPinZ(null);
        } else if (pin instanceof Map<?, ?> p) {
            t.setPinX(toFloat(p.get("x")));
            t.setPinY(toFloat(p.get("y")));
            t.setPinZ(toFloat(p.get("z")));
        }
        topicMapper.updateById(t);
        return Map.of("success", true);
    }

    /** 删主题只断开归属，不连带删掉用户攒下的知识点 */
    @DeleteMapping("/starmap/topic/{id:\\d+}")
    public Map<String, Object> deleteTopic(@PathVariable Long id) {
        StarmapTopic t = ownedTopic(id);
        if (t == null) return Map.of("success", false);
        int detached = 0;
        for (StarmapPoint p : ownedPoints(getCurrentUserId())) {
            if (id.equals(p.getTopicId())) {
                p.setTopicId(null);
                p.setHierLine(0);
                pointMapper.updateById(p);
                detached++;
            }
        }
        topicMapper.deleteById(id);
        return Map.of("success", true, "detached", detached);
    }

    @PostMapping("/starmap/topic/unpin-all")
    public Map<String, Object> unpinAll() {
        int n = 0;
        Long userId = getCurrentUserId();
        for (StarmapTopic t : ownedTopics(userId)) {
            if (t.getPinX() == null && t.getPinY() == null && t.getPinZ() == null) continue;
            t.setPinX(null); t.setPinY(null); t.setPinZ(null);
            topicMapper.updateById(t);
            n++;
        }
        for (StarmapPoint p : ownedPoints(userId)) {
            if (p.getPinX() == null && p.getPinY() == null && p.getPinZ() == null) continue;
            p.setPinX(null); p.setPinY(null); p.setPinZ(null);
            pointMapper.updateById(p);
            n++;
        }
        return Map.of("success", true, "count", n);
    }

    // ============================ 星系（手建雾团） ============================

    @PostMapping("/starmap/galaxy")
    public Map<String, Object> addGalaxy(@RequestBody Map<String, Object> body) {
        Long userId = getCurrentUserId();
        String title = str(body.get("title"));
        if (title.isBlank()) throw new RuntimeException("星系名字不能为空");
        StarmapGalaxy g = new StarmapGalaxy();
        g.setUserId(userId);
        g.setTitle(cut(title, 60));
        String color = str(body.get("color"));
        if (!color.isBlank()) g.setColor(cut(color, 40));
        applyGalaxyPin(g, body.get("pin"));
        galaxyMapper.insert(g);
        return Map.of("id", g.getId());
    }

    /** 改名/换色/拖动雾团中心。不传 pin 就不改位置；pin:null 表示回到自动排位 */
    @PutMapping("/starmap/galaxy/{id:\\d+}")
    public Map<String, Object> updateGalaxy(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        StarmapGalaxy g = ownedGalaxy(id);
        if (g == null) return Map.of("success", false);
        if (body.containsKey("title")) {
            String title = str(body.get("title"));
            if (!title.isBlank()) g.setTitle(cut(title, 60));
        }
        if (body.containsKey("color")) g.setColor(nullToBlank(str(body.get("color"))));
        if (body.containsKey("pin")) {
            Object pin = body.get("pin");
            if (pin == null) {
                g.setPinX(null); g.setPinY(null); g.setPinZ(null);
            } else {
                applyGalaxyPin(g, pin);
            }
        }
        galaxyMapper.updateById(g);
        return Map.of("success", true);
    }

    /** 删星系不删星球：成员退回标题派生，没前缀的就是独立星球 */
    @DeleteMapping("/starmap/galaxy/{id:\\d+}")
    public Map<String, Object> deleteGalaxy(@PathVariable Long id) {
        StarmapGalaxy g = ownedGalaxy(id);
        if (g == null) return Map.of("success", false);
        int detached = 0;
        for (StarmapTopic t : ownedTopics(getCurrentUserId())) {
            if (!Objects.equals(id, t.getGalaxyId())) continue;
            t.setGalaxyId(null);
            topicMapper.updateById(t);
            detached++;
        }
        galaxyMapper.deleteById(id);
        return Map.of("success", true, "detached", detached);
    }

    private void applyGalaxyPin(StarmapGalaxy g, Object pin) {
        if (pin instanceof Map<?, ?> p) {
            g.setPinX(toFloat(p.get("x")));
            g.setPinY(toFloat(p.get("y")));
            g.setPinZ(toFloat(p.get("z")));
        }
    }

    // ============================ 知识点（小球） ============================

    @GetMapping("/starmap/point/match")
    public Map<String, Object> matchPoint(@RequestParam String title) {
        String key = StarMapSupport.normalizeTitle(title);
        StarmapPoint hit = key.isEmpty() ? null : findPointByKey(getCurrentUserId(), key);
        return Map.of("hit", hit == null ? Map.of() : pointMap(hit));
    }

    @PostMapping("/starmap/point")
    public Map<String, Object> addPoint(@RequestBody Map<String, Object> body) {
        Long userId = getCurrentUserId();
        String title = str(body.get("title"));
        if (title.isBlank()) throw new RuntimeException("知识点名字不能为空");
        String key = StarMapSupport.normalizeTitle(title);
        StarmapPoint dup = findPointByKey(userId, key);
        boolean force = Boolean.TRUE.equals(body.get("force"));
        if (dup != null && !force) {
            return Map.of("duplicate", true, "hit", pointMap(dup));
        }
        Long topicId = toLong(body.get("topicId"));
        StarmapPoint p = new StarmapPoint();
        p.setUserId(userId);
        p.setTopicId(topicId);
        // 归属与连线分开：只有确实归到了某颗球才默认画线
        p.setHierLine(topicId == null ? 0 : 1);
        p.setTitle(cut(title, 120));
        p.setTitleKey(cut(key, 120));
        p.setNote(cut(str(body.get("note")), 1000));
        p.setMerged(0);
        p.setOrigin("手动");
        // 游离星尘要记住右键的位置；球内星点不需要（由布局排）
        Object pin = body.get("pin");
        if (pin instanceof Map<?, ?> q) {
            p.setPinX(toFloat(q.get("x")));
            p.setPinY(toFloat(q.get("y")));
            p.setPinZ(toFloat(q.get("z")));
        }
        pointMapper.insert(p);
        return Map.of("id", p.getId());
    }

    @PutMapping("/starmap/point/{id:\\d+}")
    public Map<String, Object> updatePoint(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        StarmapPoint p = ownedPoint(id);
        if (p == null) return Map.of("success", false);
        Set<Long> touchedQuestions = new HashSet<>();
        if (body.containsKey("title")) {
            String title = str(body.get("title"));
            if (!title.isBlank()) {
                p.setTitle(cut(title, 120));
                p.setTitleKey(cut(StarMapSupport.normalizeTitle(title), 120));
            }
        }
        if (body.containsKey("note")) p.setNote(cut(str(body.get("note")), 1000));
        if (body.containsKey("color")) p.setColor(nullToBlank(str(body.get("color"))));
        if (body.containsKey("merged")) p.setMerged(truthy(body.get("merged")) ? 1 : 0);
        if (body.containsKey("hierLine")) p.setHierLine(truthy(body.get("hierLine")) ? 1 : 0);
        if (body.containsKey("topicId")) {
            Long topicId = toLong(body.get("topicId"));
            // 钉子是相对旧大球的偏移，换了大球就没意义了，回到自动排布
            if (!Objects.equals(topicId, p.getTopicId())) { p.setPinX(null); p.setPinY(null); p.setPinZ(null); }
            p.setTopicId(topicId);
            if (topicId == null) p.setHierLine(0);
        }
        if (body.containsKey("pin")) {
            Object pin = body.get("pin");
            if (pin instanceof Map<?, ?> q) {
                p.setPinX(toFloat(q.get("x")));
                p.setPinY(toFloat(q.get("y")));
                p.setPinZ(toFloat(q.get("z")));
            } else {
                p.setPinX(null); p.setPinY(null); p.setPinZ(null);
            }
        }
        pointMapper.updateById(p);
        for (StarmapPointRef r : refsOfPoint(p.getId())) touchedQuestions.add(r.getWrongQuestionId());
        refreshKnowledgePoints(touchedQuestions);
        return Map.of("success", true);
    }

    @DeleteMapping("/starmap/point/{id:\\d+}")
    public Map<String, Object> deletePoint(@PathVariable Long id) {
        StarmapPoint p = ownedPoint(id);
        if (p == null) return Map.of("success", false);
        Set<Long> touched = new HashSet<>();
        for (StarmapPointRef r : refsOfPoint(id)) touched.add(r.getWrongQuestionId());
        if (refMapper != null) refMapper.delete(new LambdaQueryWrapper<StarmapPointRef>().eq(StarmapPointRef::getPointId, id));
        if (edgeMapper != null) {
            edgeMapper.delete(new LambdaQueryWrapper<StarmapEdge>()
                .eq(StarmapEdge::getUserId, p.getUserId())
                .and(w -> w.eq(StarmapEdge::getFromPoint, id).or().eq(StarmapEdge::getToPoint, id)));
        }
        pointMapper.deleteById(id);
        refreshKnowledgePoints(touched);
        return Map.of("success", true);
    }

    /** 查重命中后用户选"合并到它"：关联记录整体迁移，重复的那颗消失 */
    @PostMapping("/starmap/point/{id:\\d+}/merge-into")
    public Map<String, Object> mergeInto(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        StarmapPoint from = ownedPoint(id);
        StarmapPoint into = ownedPoint(toLong(body.get("intoId")));
        if (from == null || into == null || from.getId().equals(into.getId())) return Map.of("success", false);
        Set<Long> touched = new HashSet<>();
        Set<Long> existing = new HashSet<>();
        for (StarmapPointRef r : refsOfPoint(into.getId())) existing.add(r.getWrongQuestionId());
        for (StarmapPointRef r : refsOfPoint(from.getId())) {
            touched.add(r.getWrongQuestionId());
            if (existing.add(r.getWrongQuestionId())) {
                r.setPointId(into.getId());
                refMapper.updateById(r);
            } else {
                refMapper.deleteById(r.getId());
            }
        }
        if (edgeMapper != null) {
            for (StarmapEdge e : edgeMapper.selectList(new LambdaQueryWrapper<StarmapEdge>()
                .eq(StarmapEdge::getUserId, from.getUserId())
                .and(w -> w.eq(StarmapEdge::getFromPoint, from.getId()).or().eq(StarmapEdge::getToPoint, from.getId())))) {
                e.setFromPoint(from.getId().equals(e.getFromPoint()) ? into.getId() : e.getFromPoint());
                e.setToPoint(from.getId().equals(e.getToPoint()) ? into.getId() : e.getToPoint());
                if (Objects.equals(e.getFromPoint(), e.getToPoint())) edgeMapper.deleteById(e.getId());
                else edgeMapper.updateById(e);
            }
        }
        pointMapper.deleteById(from.getId());
        touched.addAll(touchedOfPoint(into.getId()));
        refreshKnowledgePoints(touched);
        return Map.of("success", true, "intoId", into.getId());
    }

    // ============================ 错题 ↔ 知识点 ============================

    /**
     * 手动把知识点挂到某道错题上。共现线与掌握度都只认这张关联表，
     * 有了这个入口，不烧 AI 额度也能把关系攒出来。
     */
    @PostMapping("/starmap/point/{id:\\d+}/ref")
    public Map<String, Object> addRef(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        StarmapPoint p = ownedPoint(id);
        Long qid = toLong(body == null ? null : body.get("wrongQuestionId"));
        if (p == null || qid == null || refMapper == null || wrongQuestionMapper == null) return Map.of("success", false);
        UserWrongQuestion wq = wrongQuestionMapper.selectById(qid);
        if (wq == null || !Objects.equals(wq.getUserId(), p.getUserId())) return Map.of("success", false, "error", "这道错题不是你的");
        long dup = refMapper.selectCount(new LambdaQueryWrapper<StarmapPointRef>()
            .eq(StarmapPointRef::getUserId, p.getUserId())
            .eq(StarmapPointRef::getPointId, id)
            .eq(StarmapPointRef::getWrongQuestionId, qid));
        if (dup == 0) {
            StarmapPointRef r = new StarmapPointRef();
            r.setUserId(p.getUserId());
            r.setPointId(id);
            r.setWrongQuestionId(qid);
            r.setSource("手动挂上");
            refMapper.insert(r);
        }
        refreshKnowledgePoints(Set.of(qid));
        return Map.of("success", true);
    }

    @DeleteMapping("/starmap/point/{id:\\d+}/ref/{qid:\\d+}")
    public Map<String, Object> deleteRef(@PathVariable Long id, @PathVariable Long qid) {
        StarmapPoint p = ownedPoint(id);
        if (p == null || refMapper == null) return Map.of("success", false);
        refMapper.delete(new LambdaQueryWrapper<StarmapPointRef>()
            .eq(StarmapPointRef::getUserId, p.getUserId())
            .eq(StarmapPointRef::getPointId, id)
            .eq(StarmapPointRef::getWrongQuestionId, qid));
        refreshKnowledgePoints(Set.of(qid));
        return Map.of("success", true);
    }

    // ============================ 连线 ============================

    @PostMapping("/starmap/edge")
    public Map<String, Object> addEdge(@RequestBody Map<String, Object> body) {
        Long userId = getCurrentUserId();
        Long from = toLong(body.get("from"));
        Long to = toLong(body.get("to"));
        String fromKind = orDefault(str(body.get("fromKind")), "point");
        String toKind = orDefault(str(body.get("toKind")), "point");
        if (from == null || to == null || from.equals(to)) throw new RuntimeException("不能自己连自己");
        if (!endpointExists(from, fromKind, pointIds(userId)) || !endpointExists(to, toKind, pointIds(userId))) {
            throw new RuntimeException("连线两端必须都是你已经有的节点");
        }
        StarmapEdge e = new StarmapEdge();
        e.setUserId(userId);
        e.setFromPoint(from);
        e.setToPoint(to);
        e.setFromKind(fromKind);
        e.setToKind(toKind);
        e.setKind("custom");
        e.setRel(cut(orDefault(str(body.get("rel")), "关联"), 20));
        e.setReason(cut(str(body.get("reason")), 500));
        e.setStatus("accepted");
        edgeMapper.insert(e);
        return Map.of("id", e.getId());
    }

    @PostMapping("/starmap/edge/{id:\\d+}/accept")
    public Map<String, Object> acceptEdge(@PathVariable Long id) {
        StarmapEdge e = ownedEdge(id);
        if (e == null) return Map.of("success", false);
        e.setStatus("accepted");
        edgeMapper.updateById(e);
        return Map.of("success", true);
    }

    /** 自建线直接删；带 veto=1 时同时记否决，AI 重跑也不会再提同一对 */
    @DeleteMapping("/starmap/edge/{id:\\d+}")
    public Map<String, Object> deleteEdge(@PathVariable Long id, @RequestParam(required = false) Integer veto) {
        StarmapEdge e = ownedEdge(id);
        if (e == null) return Map.of("success", false);
        edgeMapper.deleteById(id);
        if (veto != null && veto == 1) {
            addVeto(e.getUserId(), "ai", e.getFromPoint(), e.getToPoint(), e.getFromKind(), e.getToKind());
        }
        return Map.of("success", true);
    }

    /** 派生线（共现/层级）在库里没有行，删除必须走这里记一条否决 */
    @PostMapping("/starmap/edge/veto")
    public Map<String, Object> veto(@RequestBody Map<String, Object> body) {
        Long userId = getCurrentUserId();
        String kind = orDefault(str(body.get("kind")), "cooc");
        addVeto(userId, kind, toLong(body.get("aPoint")), toLong(body.get("bPoint")),
            orDefault(str(body.get("aKind")), "point"), orDefault(str(body.get("bKind")), "point"));
        return Map.of("success", true);
    }

    @DeleteMapping("/starmap/edge/veto")
    public Map<String, Object> undoVeto(@RequestParam String kind,
                                        @RequestParam(required = false) Long aPoint,
                                        @RequestParam(required = false) Long bPoint,
                                        @RequestParam(required = false) String aKey,
                                        @RequestParam(required = false) String bKey) {
        if (vetoMapper == null) return Map.of("success", false);
        Long userId = getCurrentUserId();
        List<StarmapVeto> rows = vetoMapper.selectList(new LambdaQueryWrapper<StarmapVeto>()
            .eq(StarmapVeto::getUserId, userId)
            .eq(StarmapVeto::getKind, kind));
        int n = 0;
        for (StarmapVeto v : rows) {
            boolean byId = aPoint != null && bPoint != null
                && aPoint.equals(v.getPointA()) && bPoint.equals(v.getPointB());
            boolean byKey = aKey != null && aKey.equals(v.getKeyA()) && bKey != null && bKey.equals(v.getKeyB());
            if (byId || byKey) { vetoMapper.deleteById(v.getId()); n++; }
        }
        return Map.of("success", true, "count", n);
    }

    // ============================ 外观 ============================

    @PutMapping("/starmap/style")
    public Map<String, Object> putStyle(@RequestBody Map<String, Object> body) {
        Long userId = getCurrentUserId();
        String targetType = orDefault(str(body.get("targetType")), "edge");
        String targetKey = str(body.get("targetKey"));
        Object style = body.get("style");
        if (targetKey.isBlank() || style == null) return Map.of("success", false);
        try {
            StarmapStyle row = styleMapper.selectOne(new LambdaQueryWrapper<StarmapStyle>()
                .eq(StarmapStyle::getUserId, userId)
                .eq(StarmapStyle::getTargetType, targetType)
                .eq(StarmapStyle::getTargetKey, targetKey));
            Map<String, Object> merged = new LinkedHashMap<>();
            if (row != null) merged.putAll(mapper.readValue(row.getStyleJson(), new TypeReference<>() {}));
            merged.putAll(asMap(style));
            String json = mapper.writeValueAsString(merged);
            if (row == null) {
                row = new StarmapStyle();
                row.setUserId(userId);
                row.setTargetType(targetType);
                row.setTargetKey(cut(targetKey, 140));
                row.setStyleJson(cut(json, 800));
                styleMapper.insert(row);
            } else {
                row.setStyleJson(cut(json, 800));
                styleMapper.updateById(row);
            }
            return Map.of("success", true);
        } catch (Exception e) {
            log.warn("星图外观保存失败: {}", e.getMessage());
            return Map.of("success", false, "error", "配置格式不对");
        }
    }

    @DeleteMapping("/starmap/style")
    public Map<String, Object> deleteStyle(@RequestParam String targetKey) {
        if (styleMapper == null) return Map.of("success", false);
        styleMapper.delete(new LambdaQueryWrapper<StarmapStyle>()
            .eq(StarmapStyle::getUserId, getCurrentUserId())
            .eq(StarmapStyle::getTargetKey, targetKey));
        return Map.of("success", true);
    }

    // ============================ AI 反推知识点 ============================

    @PostMapping("/starmap/ai/points")
    public Map<String, Object> analyze(@RequestBody(required = false) Map<String, Object> body) {
        Long userId = getCurrentUserId();
        boolean retryFailed = body != null && truthy(body.get("retryFailed"));
        if (taskManager.hasRunningTask(userId, "starmap-points")) return Map.of("taskId", "", "reason", "busy");
        List<Long> selectedIds = new ArrayList<>();
        Object rawIds = body == null ? null : body.get("questionIds");
        if (rawIds instanceof List<?> list) {
            for (Object o : list) {
                Long id = toLong(o);
                if (id != null) selectedIds.add(id);
            }
        }
        List<UserWrongQuestion> queue = selectedIds.isEmpty()
            ? aiService.pickUnanalyzed(userId, retryFailed)
            : aiService.pickSelected(userId, selectedIds);
        if (queue.isEmpty()) return Map.of("taskId", "", "reason", "no-unanalyzed", "total", 0);
        String taskId = taskManager.createTask(userId, "starmap-points", "错题反推知识点");
        aiService.analyze(taskId, userId, queue);
        return Map.of("taskId", taskId, "total", queue.size());
    }

    /** 给“选择错题反推”弹窗用：未反推的错题（最多 200 条给前端搜索/分页） */
    @GetMapping("/starmap/ai/unanalyzed")
    public Map<String, Object> unanalyzedList() {
        Long userId = getCurrentUserId();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (UserWrongQuestion wq : aiService.pickUnanalyzed(userId, false, 200)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", wq.getId());
            m.put("stem", questionSnippet(wq.getQuestionContent()));
            m.put("type", wq.getQuestionType());
            m.put("errorTypes", wq.getErrorTypes() == null ? "" : wq.getErrorTypes());
            rows.add(m);
        }
        return Map.of("list", rows, "count", rows.size());
    }

    @GetMapping("/starmap/ai/unanalyzed-count")
    public Map<String, Object> unanalyzedCount() {
        Long userId = getCurrentUserId();
        return Map.of("count", aiService.unanalyzedCount(userId, false),
            "failed", aiService.failedCount(userId),
            "running", taskManager.hasRunningTask(userId, "starmap-points"));
    }

    /** 候选确认才进图：同名命中已有知识点就并入，不新建第二颗 */
    @PostMapping("/starmap/ai/candidate/{id:\\d+}/accept")
    public Map<String, Object> acceptCandidate(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        StarmapAiPoint c = ownedCandidate(id);
        if (c == null) return Map.of("success", false);
        Long userId = c.getUserId();
        StarmapPoint point = findPointByKey(userId, c.getTitleKey());
        boolean merged = point != null;
        Long topicId = body == null ? null : toLong(body.get("topicId"));
        if (point == null) {
            point = new StarmapPoint();
            point.setUserId(userId);
            point.setTopicId(topicId);
            point.setHierLine(topicId == null ? 0 : 1);
            point.setTitle(c.getTitle());
            point.setTitleKey(c.getTitleKey());
            point.setMerged(0);
            point.setOrigin("AI反推");
            pointMapper.insert(point);
        } else if (topicId != null && point.getTopicId() == null) {
            // 同名的那颗星本来没归过队：用户这次选了大球就顺手挂上去，不算改他的归属
            point.setTopicId(topicId);
            point.setHierLine(1);
            pointMapper.updateById(point);
        }
        boolean already = false;
        for (StarmapPointRef r : refsOfPoint(point.getId())) {
            if (r.getWrongQuestionId().equals(c.getWrongQuestionId())) already = true;
        }
        if (!already) {
            StarmapPointRef ref = new StarmapPointRef();
            ref.setUserId(userId);
            ref.setWrongQuestionId(c.getWrongQuestionId());
            ref.setPointId(point.getId());
            ref.setSource("AI确认");
            refMapper.insert(ref);
        }
        c.setStatus("accepted");
        c.setAcceptedPointId(point.getId());
        aiPointMapper.updateById(c);
        refreshKnowledgePoints(Set.of(c.getWrongQuestionId()));
        return Map.of("pointId", point.getId(), "merged", merged);
    }

    /** 忽略：保留行（status=rejected），这样重跑批不会又把它提出来 */
    @DeleteMapping("/starmap/ai/candidate/{id:\\d+}")
    public Map<String, Object> rejectCandidate(@PathVariable Long id) {
        StarmapAiPoint c = ownedCandidate(id);
        if (c == null) return Map.of("success", false);
        c.setStatus("rejected");
        aiPointMapper.updateById(c);
        return Map.of("success", true);
    }

    // ============================ 内部工具 ============================

    /** 把某题已确认的知识点标题写回 user_wrong_question.knowledge_points（只是展示缓存） */
    private void refreshKnowledgePoints(Set<Long> questionIds) {
        if (questionIds == null || questionIds.isEmpty() || wrongQuestionMapper == null || refMapper == null) return;
        for (Long qid : questionIds) {
            if (qid == null) continue;
            UserWrongQuestion wq = wrongQuestionMapper.selectById(qid);
            if (wq == null) continue;
            List<String> titles = new ArrayList<>();
            for (StarmapPointRef r : refMapper.selectList(new LambdaQueryWrapper<StarmapPointRef>()
                .eq(StarmapPointRef::getWrongQuestionId, qid))) {
                StarmapPoint p = pointMapper.selectById(r.getPointId());
                if (p != null && !titles.contains(p.getTitle())) titles.add(p.getTitle());
            }
            wq.setKnowledgePoints(cut(String.join(",", titles), 480));
            wrongQuestionMapper.updateById(wq);
        }
    }

    private void addVeto(Long userId, String kind, Long aRaw, Long bRaw, String aKind, String bKind) {
        if (vetoMapper == null || aRaw == null || bRaw == null) return;
        Long lo = aRaw.compareTo(bRaw) <= 0 ? aRaw : bRaw;
        Long hi = aRaw.compareTo(bRaw) <= 0 ? bRaw : aRaw;
        String loKind = aRaw.compareTo(bRaw) <= 0 ? aKind : bKind;
        String hiKind = aRaw.compareTo(bRaw) <= 0 ? bKind : aKind;
        StarmapVeto v = new StarmapVeto();
        v.setUserId(userId);
        v.setKind(kind);
        v.setPointA(loKind.equals("topic") ? null : lo);
        v.setPointB(hiKind.equals("topic") ? null : hi);
        v.setKeyA(cut(titleKeyOf(lo, loKind), 120));
        v.setKeyB(cut(titleKeyOf(hi, hiKind), 120));
        v.setTitleA(cut(titleOf(lo, loKind), 120));
        v.setTitleB(cut(titleOf(hi, hiKind), 120));
        long exists = vetoMapper.selectCount(new LambdaQueryWrapper<StarmapVeto>()
            .eq(StarmapVeto::getUserId, userId)
            .eq(StarmapVeto::getKind, kind)
            .eq(StarmapVeto::getKeyA, v.getKeyA())
            .eq(StarmapVeto::getKeyB, v.getKeyB()));
        if (exists > 0) return;
        vetoMapper.insert(v);
    }

    private String titleOf(Long id, String kind) {
        if ("topic".equals(kind)) {
            StarmapTopic t = topicMapper.selectById(id);
            return t == null ? "" : t.getTitle();
        }
        StarmapPoint p = pointMapper.selectById(id);
        return p == null ? "" : p.getTitle();
    }

    private String titleKeyOf(Long id, String kind) {
        if ("topic".equals(kind)) {
            StarmapTopic t = topicMapper.selectById(id);
            return t == null ? "" : StarMapSupport.normalizeTitle(t.getTitle());
        }
        StarmapPoint p = pointMapper.selectById(id);
        return p == null ? "" : StarMapSupport.normalizeTitle(p.getTitle());
    }

    private Set<Long> touchedOfPoint(Long pointId) {
        Set<Long> out = new HashSet<>();
        for (StarmapPointRef r : refsOfPoint(pointId)) out.add(r.getWrongQuestionId());
        return out;
    }

    private List<StarmapPointRef> refsOfPoint(Long pointId) {
        if (refMapper == null) return List.of();
        return refMapper.selectList(new LambdaQueryWrapper<StarmapPointRef>().eq(StarmapPointRef::getPointId, pointId));
    }

    private StarmapPoint findPointByKey(Long userId, String key) {
        if (pointMapper == null || key == null || key.isEmpty()) return null;
        return pointMapper.selectOne(new LambdaQueryWrapper<StarmapPoint>()
            .eq(StarmapPoint::getUserId, userId)
            .eq(StarmapPoint::getTitleKey, key)
            .orderByAsc(StarmapPoint::getId)
            .last("limit 1"));
    }

    private List<StarmapTopic> ownedTopics(Long userId) {
        return topicMapper.selectList(new LambdaQueryWrapper<StarmapTopic>()
            .eq(StarmapTopic::getUserId, userId).orderByAsc(StarmapTopic::getId));
    }

    private List<StarmapGalaxy> ownedGalaxies(Long userId) {
        if (galaxyMapper == null) return List.of();
        return galaxyMapper.selectList(new LambdaQueryWrapper<StarmapGalaxy>()
            .eq(StarmapGalaxy::getUserId, userId).orderByAsc(StarmapGalaxy::getId));
    }

    private StarmapGalaxy ownedGalaxy(Long id) {
        if (id == null || galaxyMapper == null) return null;
        StarmapGalaxy g = galaxyMapper.selectById(id);
        return g != null && Objects.equals(g.getUserId(), getCurrentUserId()) ? g : null;
    }

    private List<StarmapPoint> ownedPoints(Long userId) {
        return pointMapper.selectList(new LambdaQueryWrapper<StarmapPoint>()
            .eq(StarmapPoint::getUserId, userId).orderByAsc(StarmapPoint::getId));
    }

    private Set<Long> pointIds(Long userId) {
        Set<Long> out = new HashSet<>();
        for (StarmapPoint p : ownedPoints(userId)) out.add(p.getId());
        return out;
    }

    private StarmapTopic ownedTopic(Long id) {
        if (topicMapper == null) return null;
        StarmapTopic t = topicMapper.selectById(id);
        return t != null && Objects.equals(t.getUserId(), getCurrentUserId()) ? t : null;
    }

    private StarmapPoint ownedPoint(Long id) {
        if (id == null || pointMapper == null) return null;
        StarmapPoint p = pointMapper.selectById(id);
        return p != null && Objects.equals(p.getUserId(), getCurrentUserId()) ? p : null;
    }

    private StarmapEdge ownedEdge(Long id) {
        if (edgeMapper == null) return null;
        StarmapEdge e = edgeMapper.selectById(id);
        return e != null && Objects.equals(e.getUserId(), getCurrentUserId()) ? e : null;
    }

    private StarmapAiPoint ownedCandidate(Long id) {
        if (aiPointMapper == null) return null;
        StarmapAiPoint c = aiPointMapper.selectById(id);
        return c != null && Objects.equals(c.getUserId(), getCurrentUserId()) ? c : null;
    }

    private Map<String, Object> topicMap(StarmapTopic t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.getId());
        m.put("title", t.getTitle());
        m.put("note", t.getNote());
        m.put("color", t.getColor());
        m.put("galaxyId", t.getGalaxyId());
        m.put("source", "我自己建的主题");
        // 钉子三列要么一起有值要么一起为空；Map.of 不收 null，所以这里手搓
        m.put("pin", t.getPinX() == null ? null : pinMap(t));
        return m;
    }

    private Map<String, Object> galaxyMap(StarmapGalaxy g) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", g.getId());
        m.put("title", g.getTitle());
        m.put("color", g.getColor());
        m.put("pin", g.getPinX() == null ? null : galaxyPinMap(g));
        return m;
    }

    private Map<String, Object> galaxyPinMap(StarmapGalaxy g) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("x", g.getPinX());
        p.put("y", g.getPinY());
        p.put("z", g.getPinZ());
        return p;
    }

    private Map<String, Object> pinMap(StarmapTopic t) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("x", t.getPinX());
        p.put("y", t.getPinY());
        p.put("z", t.getPinZ());
        return p;
    }

    private Map<String, Object> pointMap(StarmapPoint p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", p.getId());
        m.put("topicId", p.getTopicId());
        m.put("hierLine", p.getHierLine());
        m.put("title", p.getTitle());
        m.put("titleKey", p.getTitleKey());
        m.put("note", p.getNote());
        m.put("color", p.getColor());
        m.put("merged", p.getMerged());
        m.put("origin", p.getOrigin());
        if (p.getPinX() == null) {
            m.put("pin", null);
        } else {
            Map<String, Object> pin = new LinkedHashMap<>();
            pin.put("x", p.getPinX());
            pin.put("y", p.getPinY());
            pin.put("z", p.getPinZ());
            m.put("pin", pin);
        }
        return m;
    }

    private Map<String, Object> edgeMap(StarmapEdge e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", e.getId());
        m.put("from", e.getFromPoint());
        m.put("to", e.getToPoint());
        m.put("fromKind", e.getFromKind());
        m.put("toKind", e.getToKind());
        m.put("kind", e.getKind());
        m.put("rel", e.getRel());
        m.put("reason", e.getReason());
        m.put("conf", e.getConf());
        m.put("status", e.getStatus());
        return m;
    }

    private String questionSnippet(String content) {
        if (content == null) return "";
        try {
            Map<String, Object> q = mapper.readValue(content, new TypeReference<>() {});
            for (String k : new String[] { "stem", "question", "content", "title", "body" }) {
                Object v = q.get(k);
                if (v != null && !String.valueOf(v).isBlank()) return cut(String.valueOf(v), 60);
            }
            return "";
        } catch (Exception e) {
            return cut(content, 60);
        }
    }

    private Long getCurrentUserId() {
        if (jwtAuth == null) throw new RuntimeException("登录信息不可用");
        return jwtAuth.getCurrentUserId();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object o) {
        return o instanceof Map ? (Map<String, Object>) o : Map.of();
    }

    private static String str(Object o) { return o == null ? "" : String.valueOf(o); }

    private static String orDefault(String s, String d) { return s == null || s.isBlank() ? d : s; }

    private static String nullToBlank(String s) { return s == null || s.isBlank() ? null : s; }

    private static String cut(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static boolean truthy(Object o) {
        if (o == null) return false;
        if (o instanceof Boolean b) return b;
        if (o instanceof Number n) return n.intValue() != 0;
        String s = String.valueOf(o);
        return "1".equals(s) || "true".equalsIgnoreCase(s);
    }

    private static Long toLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(o)); } catch (Exception e) { return null; }
    }

    private static Float toFloat(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.floatValue();
        try { return Float.parseFloat(String.valueOf(o)); } catch (Exception e) { return null; }
    }
}
