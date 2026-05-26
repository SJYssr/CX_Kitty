import { Router } from 'express';
import pool from '../db.js';
import { sanitizeError } from '../error.js';

const router = Router();

router.get('/system/task-count', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS count FROM study_tasks WHERE status = 'running'"
    );
    res.json({ success: true, count: rows[0].count, max: 50 });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

export default router;
