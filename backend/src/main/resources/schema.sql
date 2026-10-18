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
-- WisdomL 私人 Wiki 手动笔记 + 双向链接：给 wiki_public_knowledge 增加 3 列
-- PR-1 迁移。幂等：逐列判断，缺失才加，重复执行安全（别人环境同步用）。
-- 适用 MySQL 8.x。执行前 USE 到你的库（如 xmdb）。纯加可空列，不动存量数据。
-- ============================================================

SET @db := DATABASE();

-- note_type
SET @s := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=@db AND TABLE_NAME='wiki_public_knowledge' AND COLUMN_NAME='note_type')=0,
  'ALTER TABLE `wiki_public_knowledge` ADD COLUMN `note_type` tinyint DEFAULT NULL COMMENT ''手动笔记子类型：1知识点 2词汇 3长难句 4个人批注；非手动条目为 NULL''',
  'SELECT ''[skip] note_type 已存在'' AS msg'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- tags
SET @s := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=@db AND TABLE_NAME='wiki_public_knowledge' AND COLUMN_NAME='tags')=0,
  'ALTER TABLE `wiki_public_knowledge` ADD COLUMN `tags` varchar(255) DEFAULT NULL COMMENT ''主题标签，逗号分隔，供标签优先检索用''',
  'SELECT ''[skip] tags 已存在'' AS msg'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- links
SET @s := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=@db AND TABLE_NAME='wiki_public_knowledge' AND COLUMN_NAME='links')=0,
  'ALTER TABLE `wiki_public_knowledge` ADD COLUMN `links` varchar(1024) DEFAULT NULL COMMENT ''双向链接：目标条目 id 的 JSON 数组，如 [3,17]''',
  'SELECT ''[skip] links 已存在'' AS msg'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 校验：应列出 note_type / tags / links 三行
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=@db AND TABLE_NAME='wiki_public_knowledge'
  AND COLUMN_NAME IN ('note_type','tags','links')
ORDER BY COLUMN_NAME;