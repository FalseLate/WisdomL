-- 在 Navicat 中运行下面两条 CREATE TABLE 语句

USE zhifuxi;

-- 用户表
CREATE TABLE IF NOT EXISTS `user` (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    password VARCHAR(255) NOT NULL COMMENT '加密密码',
    nickname VARCHAR(50) DEFAULT '' COMMENT '昵称',
    avatar VARCHAR(255) DEFAULT '' COMMENT '头像URL',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 题目记录表
CREATE TABLE IF NOT EXISTS question_record (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    user_id BIGINT DEFAULT NULL COMMENT '用户ID',
    title VARCHAR(200) DEFAULT '' COMMENT '文档标题',
    source_text TEXT NOT NULL COMMENT '用户输入的原始文本',
    questions_json LONGTEXT NOT NULL COMMENT 'AI生成的题目JSON',
    question_count INT DEFAULT 0 COMMENT '题目数量',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='出题记录';

-- 答题记录表
CREATE TABLE IF NOT EXISTS answer_record (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    record_id BIGINT NOT NULL COMMENT '关联出题记录ID',
    question_index INT NOT NULL COMMENT '题目序号',
    user_answer VARCHAR(10) NOT NULL COMMENT '用户答案',
    is_correct TINYINT(1) DEFAULT 0 COMMENT '是否正确',
    question_content TEXT COMMENT '题目内容JSON',
    question_type VARCHAR(20) DEFAULT 'single' COMMENT '题目类型',
    answer_time INT DEFAULT NULL COMMENT '作答用时（秒），慢题判定数据源',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '答题时间',
    FOREIGN KEY (record_id) REFERENCES question_record(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='答题记录';

-- 用户错题表（PDCA 错题闭环：错因标注 / 查看订正 / 动手重做 / 简化SM-2复习调度）
CREATE TABLE IF NOT EXISTS user_wrong_question (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    question_id VARCHAR(64) NOT NULL COMMENT '题目ID',
    question_content TEXT COMMENT '题目内容JSON',
    question_type VARCHAR(20) DEFAULT 'single' COMMENT '题目类型',
    user_answer VARCHAR(255) COMMENT '用户答案',
    correct_answer VARCHAR(255) COMMENT '正确答案',
    explanation TEXT COMMENT '解析',
    wrong_count INT DEFAULT 1 COMMENT '错误次数',
    is_removed TINYINT(1) DEFAULT 0 COMMENT '是否已移除（软删除）',
    error_types VARCHAR(100) DEFAULT NULL COMMENT '错因编码逗号分隔：audit审题/knowledge知识/math数学/strategy策略/habit习惯',
    error_note VARCHAR(1000) DEFAULT NULL COMMENT '错因反思文字（自我小结）',
    is_slow TINYINT(1) DEFAULT 0 COMMENT '是否慢题：0否 1是',
    answer_time INT DEFAULT NULL COMMENT '本次作答用时（秒）',
    status TINYINT DEFAULT 0 COMMENT '订正状态：0未订正 1看过解析未重做 2重做答对(复习中) 3已掌握',
    review_count INT DEFAULT 0 COMMENT '累计重做/复习次数',
    correct_streak INT DEFAULT 0 COMMENT '连续重做答对次数，答错清零，达到3则status=3已掌握',
    last_review_time DATETIME DEFAULT NULL COMMENT '最近一次重做时间',
    next_review_time DATETIME DEFAULT NULL COMMENT '简化SM-2下次复习时间（间隔1/3/7天）',
    knowledge_points VARCHAR(500) DEFAULT NULL COMMENT '知识点标签，一期留空',
    score INT DEFAULT NULL COMMENT '主观题AI评分0-5',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_user_id (user_id),
    INDEX idx_user_next_review (user_id, next_review_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户错题';

-- 收藏表
CREATE TABLE IF NOT EXISTS favorite (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    question_json TEXT COMMENT '题目JSON',
    question_type VARCHAR(20) DEFAULT 'single' COMMENT '题目类型',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户收藏';

-- 单词表
CREATE TABLE `word` (
                        `id` BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
                        `word` VARCHAR(100) NOT NULL COMMENT '英文单词',
                        `phonetic` VARCHAR(100) COMMENT '音标',
                        `cn_mean` VARCHAR(500) NOT NULL COMMENT '中文释义',
                        `sentence` VARCHAR(1000) COMMENT '例句',
                        `level` VARCHAR(20) COMMENT 'CET4 / CET6',
                        `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 用户生词本
CREATE TABLE `user_word` (
                             `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                             `user_id` BIGINT NOT NULL COMMENT '用户id',
                             `word_id` BIGINT NOT NULL COMMENT '单词id',
                             `master` TINYINT DEFAULT 0 COMMENT '0未掌握 1已掌握',
                             UNIQUE KEY uk_uid_wid(user_id,word_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 知识星图（starmap_*）：用户自己拥有的知识图
-- 下面这一段同样要在 Navicat 里手工执行一次（本文件不会被程序自动读取）。
-- 时间列一律 create_time/update_time，好让 MyBatisPlusConfig 的自动填充吃得到
-- （user_wrong_question 用的 created_at/updatedAt 是历史遗留，靠 MySQL 默认值）。
-- ============================================================

-- 大球：用户建的主题。pin_* 三列同时非空 = 用户手摆过的位置（钉子），同时为空 = 回自动排布
CREATE TABLE IF NOT EXISTS starmap_topic (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    title VARCHAR(100) NOT NULL COMMENT '主题名（大球）',
    note VARCHAR(1000) DEFAULT NULL COMMENT '用户写的星球说明/笔记',
    color VARCHAR(40) DEFAULT NULL COMMENT '分组色：存主题 token 名（如 --accent），不存色值，切主题自动跟随',
    galaxy_id BIGINT DEFAULT NULL COMMENT '手建星系ID；NULL=按标题前缀自动成团',
    pin_x FLOAT DEFAULT NULL COMMENT '手摆位置X（NULL=没摆过）',
    pin_y FLOAT DEFAULT NULL COMMENT '手摆位置Y',
    pin_z FLOAT DEFAULT NULL COMMENT '手摆位置Z',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_starmap_topic_user (user_id),
    INDEX idx_starmap_topic_galaxy (user_id, galaxy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识星图-主题（大球）';

-- 星系：用户手建的雾团。颜色存 token 名；pin_* 是空星系/整团拖动后的中心
CREATE TABLE IF NOT EXISTS starmap_galaxy (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    title VARCHAR(60) NOT NULL COMMENT '星系名',
    color VARCHAR(40) DEFAULT NULL COMMENT '雾团颜色 token 名',
    pin_x FLOAT DEFAULT NULL COMMENT '雾团中心X（NULL=自动排位）',
    pin_y FLOAT DEFAULT NULL COMMENT '雾团中心Y',
    pin_z FLOAT DEFAULT NULL COMMENT '雾团中心Z',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_starmap_galaxy_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识星图-星系（手建雾团）';

-- 小球：知识点。topic_id 决定"在不在球里"，hier_line 决定"那条归属线画不画"，两件事分开
CREATE TABLE IF NOT EXISTS starmap_point (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    topic_id BIGINT DEFAULT NULL COMMENT '归属主题ID；NULL=游离星，不属于任何大球',
    hier_line TINYINT(1) DEFAULT 1 COMMENT '是否画与所属主题的层级线：0不画 1画（删线不等于脱离主题）',
    title VARCHAR(120) NOT NULL COMMENT '知识点名',
    title_key VARCHAR(120) NOT NULL COMMENT '规范化名（去空白标点、统一小写），查重与否决用的稳定键',
    note VARCHAR(1000) DEFAULT NULL COMMENT '用户写的知识点描述/笔记',
    color VARCHAR(40) DEFAULT NULL COMMENT '用户钉的颜色 token 名；NULL=跟随掌握度色阶',
    merged TINYINT(1) DEFAULT 0 COMMENT '是否吸回大球成团：0散开 1合团',
    origin VARCHAR(30) DEFAULT '手动' COMMENT '来源：手动 / AI反推',
    pin_x FLOAT DEFAULT NULL COMMENT '手摆位置X：相对所属大球球心的偏移（游离星为绝对坐标），NULL=没摆过',
    pin_y FLOAT DEFAULT NULL COMMENT '手摆位置Y',
    pin_z FLOAT DEFAULT NULL COMMENT '手摆位置Z',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_starmap_point_user (user_id),
    INDEX idx_starmap_point_topic (user_id, topic_id),
    INDEX idx_starmap_point_key (user_id, title_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识星图-知识点（小球）';

-- 错题↔知识点：唯一事实源。共现线与掌握度都从这里现算，不存成品
CREATE TABLE IF NOT EXISTS starmap_point_ref (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    wrong_question_id BIGINT NOT NULL COMMENT '关联 user_wrong_question.id',
    point_id BIGINT NOT NULL COMMENT '关联 starmap_point.id',
    source VARCHAR(16) DEFAULT 'AI确认' COMMENT '这条关系怎么来的：AI确认 / 手动挂上',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_starmap_ref (user_id, wrong_question_id, point_id),
    INDEX idx_starmap_ref_point (point_id),
    INDEX idx_starmap_ref_question (wrong_question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识星图-错题与知识点的关联';

-- 语义线：AI 候选与用户自建的线。层级线与共现线不落表（由归属和关联派生）
CREATE TABLE IF NOT EXISTS starmap_edge (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    from_point BIGINT NOT NULL COMMENT '起点（先修端）ID',
    to_point BIGINT NOT NULL COMMENT '终点（箭头端）ID',
    from_kind VARCHAR(8) DEFAULT 'point' COMMENT '起点类型：point / topic',
    to_kind VARCHAR(8) DEFAULT 'point' COMMENT '终点类型：point / topic',
    kind VARCHAR(16) NOT NULL COMMENT 'ai=AI 提的候选 custom=用户自己连的',
    rel VARCHAR(20) DEFAULT '关联' COMMENT '关系：先修 / 依赖 / 关联',
    reason VARCHAR(500) DEFAULT NULL COMMENT '为什么连：AI 必须给理由，用户可选填',
    conf DECIMAL(3,2) DEFAULT NULL COMMENT 'AI 置信度 0~1；自建线为空',
    status VARCHAR(16) NOT NULL DEFAULT 'candidate' COMMENT 'candidate 待确认（不画进图）/ accepted 已确认',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_starmap_edge (user_id, from_point, to_point, kind),
    INDEX idx_starmap_edge_user (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识星图-语义连线';

-- 用户否决记录：删掉的共现线在重算时不能再冒出来。
-- 同时记 id 对与 title_key 对：只记 id 时"删掉知识点再建同名"会让线复活，只记名字时两个改名节点会误伤
CREATE TABLE IF NOT EXISTS starmap_veto (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    kind VARCHAR(16) NOT NULL COMMENT '否决的线类型：cooc / ai / hier',
    point_a BIGINT DEFAULT NULL COMMENT '端点ID（按 id 升序取 A<B）',
    point_b BIGINT DEFAULT NULL COMMENT '端点ID',
    key_a VARCHAR(120) DEFAULT NULL COMMENT '端点规范化名',
    key_b VARCHAR(120) DEFAULT NULL COMMENT '端点规范化名',
    title_a VARCHAR(120) DEFAULT NULL COMMENT '名称快照：端点已删时列表还能看懂',
    title_b VARCHAR(120) DEFAULT NULL COMMENT '名称快照',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_starmap_veto (user_id, kind, key_a, key_b),
    INDEX idx_starmap_veto_point (user_id, kind, point_a, point_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识星图-用户否决的连线';

-- 外观覆盖层：线型/颜色/粗细/透明度/箭头/隐藏，以及点与主题的颜色。
-- 用 JSON 列存，避免"每加一个可调项就要 ALTER 一次表"
CREATE TABLE IF NOT EXISTS starmap_style (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    target_type VARCHAR(12) NOT NULL COMMENT '目标类型：edge / point / topic',
    target_key VARCHAR(140) NOT NULL COMMENT '稳定键：cooc|<minId>|<maxId>、hier|<topicId>|<pointId>、ai|<edgeId>、custom|<edgeId>',
    style_json VARCHAR(800) NOT NULL COMMENT '形如 {"lineStyle":"dashed","color":"--violet","width":1.5,"opacity":0.7,"arrow":true,"hidden":false}',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_starmap_style (user_id, target_type, target_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识星图-外观与隐藏覆盖';

-- AI 反推的知识点候选 + "这题分析过了吗"。
-- 有任意一行就代表这道错题已经烧过 token 了，所以不需要给 user_wrong_question 加状态列
CREATE TABLE IF NOT EXISTS starmap_ai_point (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    wrong_question_id BIGINT NOT NULL COMMENT '关联 user_wrong_question.id',
    title VARCHAR(120) DEFAULT '' COMMENT 'AI 反推出的知识点名（failed 时为空）',
    title_key VARCHAR(120) DEFAULT '' COMMENT '规范化名，用于与已有知识点同名合并',
    reason VARCHAR(300) DEFAULT NULL COMMENT 'AI 反推的知识讲解（约100字），确认后写入 starmap_point.note',
    conf DECIMAL(3,2) DEFAULT NULL COMMENT '模型自评：该知识点与这道错题的关联把握 0~1（未校准）',
    status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending 待确认 / accepted 已落地 / rejected 用户忽略 / failed 分析失败（占位防重复烧额度）',
    accepted_point_id BIGINT DEFAULT NULL COMMENT '落地后的 starmap_point.id（同名并入时指向已有点）',
    error VARCHAR(200) DEFAULT NULL COMMENT '失败原因：AI 返回空 / 解析失败 / 网络',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_starmap_ai_question (user_id, wrong_question_id),
    INDEX idx_starmap_ai_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识星图-AI反推知识点候选';

-- 错题表预留字段的口径变更：从"一期留空"改成"已确认知识点标题的展示缓存"。
-- 关系本身存在 starmap_point_ref（带 id、可索引、能算共现），这里只供错题本直接显示一串串
ALTER TABLE user_wrong_question
    MODIFY COLUMN knowledge_points VARCHAR(500) DEFAULT NULL COMMENT '已确认知识点标题（逗号分隔，展示缓存；关系见 starmap_point_ref）';

-- 增量：已经建过 starmap_point 的库补这三列（新建库用上面的 CREATE 就已经带了，别重复跑）
-- 本机库已于 2026-10-18 执行过下面这段，注释掉只为给"早就建过表"的环境用
-- ALTER TABLE starmap_point
--     ADD COLUMN pin_x FLOAT DEFAULT NULL COMMENT '手摆位置X：相对所属大球球心的偏移（游离星为绝对坐标），NULL=没摆过' AFTER origin,
--     ADD COLUMN pin_y FLOAT DEFAULT NULL COMMENT '手摆位置Y' AFTER pin_x,
--     ADD COLUMN pin_z FLOAT DEFAULT NULL COMMENT '手摆位置Z' AFTER pin_y;

-- ============================================================
-- 历史迁移合并：note 描述字段 + 手建星系
-- 新库：上面的 CREATE TABLE 已包含这些列/表/索引，不要执行本段。
-- 已有库：确认缺列/缺表时手动执行一次，执行前先备份。
-- ============================================================

-- note：星球说明 / 知识点描述（已合并进 starmap_topic、starmap_point 的 CREATE）
-- ALTER TABLE starmap_topic
--     ADD COLUMN note VARCHAR(1000) DEFAULT NULL COMMENT '用户写的星球说明/笔记' AFTER title;
-- ALTER TABLE starmap_point
--     ADD COLUMN note VARCHAR(1000) DEFAULT NULL COMMENT '用户写的知识点描述/笔记' AFTER title_key;

-- 手建星系：星系表 + 星球的 galaxy_id（已合并进 starmap_galaxy 的 CREATE 和 starmap_topic 的 CREATE）
-- CREATE TABLE IF NOT EXISTS starmap_galaxy (
--     id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
--     user_id BIGINT NOT NULL COMMENT '用户ID',
--     title VARCHAR(60) NOT NULL COMMENT '星系名',
--     color VARCHAR(40) DEFAULT NULL COMMENT '雾团颜色 token 名',
--     pin_x FLOAT DEFAULT NULL COMMENT '雾团中心X（NULL=自动排位）',
--     pin_y FLOAT DEFAULT NULL COMMENT '雾团中心Y',
--     pin_z FLOAT DEFAULT NULL COMMENT '雾团中心Z',
--     create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
--     update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
--     INDEX idx_starmap_galaxy_user (user_id)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识星图-星系（手建雾团）';
-- ALTER TABLE starmap_topic
--     ADD COLUMN galaxy_id BIGINT DEFAULT NULL COMMENT '手建星系ID；NULL=按标题前缀自动成团' AFTER color;
-- ALTER TABLE starmap_topic
--     ADD INDEX idx_starmap_topic_galaxy (user_id, galaxy_id);

