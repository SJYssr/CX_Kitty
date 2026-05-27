-- CX_Kitty 数据库初始化脚本
-- 用于 Docker 首次启动时建表

SET time_zone = '+08:00';

CREATE TABLE IF NOT EXISTS accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) DEFAULT '',
  puid INT DEFAULT NULL,
  sex TINYINT DEFAULT -1,
  school VARCHAR(255) DEFAULT '',
  stu_id VARCHAR(50) DEFAULT '',
  deepseek_api_key VARCHAR(255) DEFAULT '',
  deepseek_model VARCHAR(50) DEFAULT 'deepseek-v4-flash',
  enable_answering TINYINT(1) DEFAULT 1,
  auto_submit TINYINT(1) DEFAULT 0,
  cover_rate FLOAT DEFAULT 0.8,
  default_speed DECIMAL(3,1) DEFAULT 1.0,
  default_jobs INT DEFAULT 1,
  notify_email VARCHAR(128) DEFAULT NULL UNIQUE,
  status VARCHAR(20) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS study_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_id INT NOT NULL,
  course_ids JSON DEFAULT NULL,
  speed INT DEFAULT 1,
  jobs INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'pending',
  progress JSON DEFAULT NULL,
  error TEXT DEFAULT NULL,
  started_at DATETIME DEFAULT NULL,
  finished_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_account_status (account_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  time VARCHAR(20) NOT NULL,
  text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_task_id (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 数据库迁移（已有数据库执行以下 SQL 添加新字段）:
-- ALTER TABLE accounts ADD COLUMN puid INT DEFAULT NULL AFTER name;
-- ALTER TABLE accounts ADD COLUMN sex TINYINT DEFAULT -1 AFTER puid;
-- ALTER TABLE accounts ADD COLUMN school VARCHAR(255) DEFAULT '' AFTER sex;
-- ALTER TABLE accounts ADD COLUMN stu_id VARCHAR(50) DEFAULT '' AFTER school;
-- ALTER TABLE accounts ADD COLUMN default_speed DECIMAL(3,1) DEFAULT 1.0 AFTER cover_rate;
-- ALTER TABLE accounts ADD COLUMN default_jobs INT DEFAULT 1 AFTER default_speed;
-- ALTER TABLE study_tasks MODIFY COLUMN jobs INT DEFAULT 1;
