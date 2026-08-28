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
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '答题时间',
    FOREIGN KEY (record_id) REFERENCES question_record(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='答题记录';

-- 用户错题表
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
    is_removed TINYINT(1) DEFAULT 0 COMMENT '是否已移除',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_user_id (user_id)
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
