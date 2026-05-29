import pool from '../db.js';

const DEFAULT_ANNOUNCEMENT = '本项目为公益项目，服务器最大承受为50个任务，答题功能未测试，不知道效果如何，望周知。';

export async function ensureSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      k VARCHAR(64) PRIMARY KEY,
      v TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 幂等插入默认公告
  await pool.query(
    'INSERT IGNORE INTO system_settings (k, v) VALUES (?, ?)',
    ['announcement', DEFAULT_ANNOUNCEMENT]
  );
  await pool.query(
    'INSERT IGNORE INTO system_settings (k, v) VALUES (?, ?)',
    ['max_tasks', '50']
  );
  await pool.query(
    'INSERT IGNORE INTO system_settings (k, v) VALUES (?, ?)',
    ['allow_speed_jobs', '1']
  );
  await pool.query(
    'INSERT IGNORE INTO system_settings (k, v) VALUES (?, ?)',
    ['default_speed', '1']
  );
  await pool.query(
    'INSERT IGNORE INTO system_settings (k, v) VALUES (?, ?)',
    ['default_jobs', '1']
  );
}

export async function getSetting(key) {
  const [rows] = await pool.query('SELECT v FROM system_settings WHERE k = ?', [key]);
  return rows.length ? rows[0].v : null;
}

export async function setSetting(key, value) {
  await pool.query(
    'INSERT INTO system_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
    [key, value]
  );
}

export async function getAllSettings() {
  const [rows] = await pool.query('SELECT k, v FROM system_settings');
  const map = {};
  for (const r of rows) map[r.k] = r.v;
  return map;
}
