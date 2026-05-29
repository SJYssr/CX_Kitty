import pool from '../db.js';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export class AdminDAO {
  findByUsername(username) {
    return pool.query('SELECT id, username, password FROM admins WHERE username = ?', [username]);
  }

  async changePassword(username, newPassword) {
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    return pool.query('UPDATE admins SET password = ? WHERE username = ?', [hash, username]);
  }

  async verifyPassword(username, password) {
    const [rows] = await this.findByUsername(username);
    if (!rows.length) return null;
    const match = await bcrypt.compare(password, rows[0].password);
    return match ? rows[0] : null;
  }
}

export async function ensureAdminsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(64) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 插入默认管理员（幂等：username 唯一约束）
  const [existing] = await pool.query('SELECT id FROM admins WHERE username = ?', ['admin']);
  if (!existing.length) {
    const hash = await bcrypt.hash('admin123', SALT_ROUNDS);
    await pool.query('INSERT INTO admins (username, password) VALUES (?, ?)', ['admin', hash]);
    console.log('  默认管理员已创建: admin');
  }
}

export const Admin = new AdminDAO();
