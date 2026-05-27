CREATE DATABASE IF NOT EXISTS cx_kitty DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cx_kitty;

CREATE TABLE IF NOT EXISTS accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  password VARCHAR(255) NOT NULL,
  deepseek_api_key VARCHAR(255) DEFAULT '',
  deepseek_model VARCHAR(50) DEFAULT 'deepseek-v4-flash',
  enable_answering TINYINT(1) DEFAULT 1,
  auto_submit TINYINT(1) DEFAULT 0,
  default_speed DECIMAL(3,1) DEFAULT 1.0,
  default_jobs INT DEFAULT 1,
  cookie_data TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS study_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_id INT NOT NULL,
  course_ids JSON,
  speed DECIMAL(3,1) DEFAULT 1.0,
  jobs INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'pending',
  progress JSON,
  error TEXT,
  started_at DATETIME,
  finished_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
