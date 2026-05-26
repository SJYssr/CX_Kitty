/**
 * 邮件通知模块 — 通过 SMTP 发送通知邮件
 * 配置从 .env 读取: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * 使用: await sendEmail('user@example.com', '标题', '内容')
 */

import nodemailer from 'nodemailer';

let transporter = null;

/** 获取或创建 transporter（懒加载） */
function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn('[Email] SMTP 未配置（缺少 SMTP_HOST），邮件功能不可用');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_PORT !== '587',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
  });

  return transporter;
}

/**
 * 发送邮件
 * @param {string} to — 收件人邮箱
 * @param {string} subject — 邮件标题
 * @param {string} html — HTML 正文
 * @returns {Promise<boolean>} — 是否发送成功
 */
export async function sendEmail(to, subject, html) {
  const t = getTransporter();
  if (!t) return false;

  try {
    const info = await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
      to,
      subject,
      html
    });
    console.log(`[Email] 发送成功 → ${to}: ${info.messageId}`);
    return true;
  } catch (err) {
    console.warn(`[Email] 发送失败 → ${to}: ${err.message}`);
    return false;
  }
}

/**
 * 发送刷课完成通知
 * @param {string} to — 收件人邮箱
 * @param {Object} task — 任务信息 { id, completed, total, courseTitle }
 */
export async function sendTaskComplete(to, task) {
  const subject = `CX_Kitty 刷课完成 🎉`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f9f9f9;border-radius:12px">
      <h2 style="margin:0 0 16px">🎉 刷课任务完成</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#666">任务编号</td><td style="padding:8px 0;font-weight:600">#${task.id}</td></tr>
        <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee">课程</td>
            <td style="padding:8px 0;font-weight:600;border-top:1px solid #eee">${task.courseTitle || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee">进度</td>
            <td style="padding:8px 0;font-weight:600;border-top:1px solid #eee">${task.completed}/${task.total} 章节</td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:12px;color:#999">CX_Kitty · 超星学习通自动化工具</p>
    </div>`;

  return sendEmail(to, subject, html);
}
