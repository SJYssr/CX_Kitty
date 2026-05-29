import { Router } from 'express';
import pool from '../db.js';
import { sanitizeError } from '../error.js';
import { getSetting, getAllSettings } from '../models/settings.js';

const router = Router();

router.get('/system/task-count', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS count FROM study_tasks WHERE status = 'running'"
    );
    const maxStr = await getSetting('max_tasks');
    const max = parseInt(maxStr, 10) || 50;
    res.json({ success: true, count: rows[0].count, max });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

router.get('/system/config', async (req, res) => {
  try {
    const allow = await getSetting('allow_speed_jobs');
    const defSpeed = await getSetting('default_speed');
    const defJobs = await getSetting('default_jobs');
    res.json({
      success: true,
      allow_speed_jobs: allow !== '0',
      default_speed: parseFloat(defSpeed) || 1,
      default_jobs: parseInt(defJobs, 10) || 1
    });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

router.get('/system/announcement', async (req, res) => {
  try {
    const text = await getSetting('announcement');
    res.json({ success: true, text: text || '' });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

export default router;
