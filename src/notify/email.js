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
 * 发送邮箱验证码
 * @param {string} to — 收件人邮箱
 * @param {string} code — 验证码
 */
export async function sendVerifyCode(to, code) {
  const subject = 'CX_Kitty邮箱验证邮件';
  const html = `<p>您好，您正在进行CX_Kitty自助刷课平台邮箱验证。</p><br>`
    + `<p>您的验证码为：<b style="font-size:28px;color:#409EFF;letter-spacing:4px">${code}</b></p><br>`
    + `<p>验证码 5 分钟内有效，如果不是本人操作，请忽略。</p>`;
  return sendEmail(to, subject, html);
}

/**
 * 发送刷课完成通知
 * @param {string} to — 收件人邮箱
 * @param {string} phone — 学习通手机号
 * @param {string} startedAt — 任务开始时间
 * @param {string} finishedAt — 任务完成时间
 * @param {string[]} courseNames — 完成的课程名称列表
 */
export async function sendTaskComplete(to, phone, startedAt, finishedAt, courseNames) {
  const subject = '刷课完成任务通知';
  const courseListHtml = courseNames.map(name => `<div style="padding:4px 0;font-size:14px">${name}</div>`).join('');
  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#f9f9f9;border-radius:12px">
      <div style="background:#fff;border-radius:8px;padding:24px">
        <p style="margin:0 0 16px;font-size:14px;line-height:1.8">
          您好，学习通手机号 ${phone}
        </p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.8">
          您在 ${startedAt} 开始的刷课任务已在 ${finishedAt} 完成
        </p>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.8">
          请您登陆学习通查收
        </p>
        <p style="margin:0 0 8px;font-size:14px;font-weight:600">
          以下是本次任务完成的课程
        </p>
        ${courseListHtml}
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#999;text-align:center">CX_Kitty · 超星学习通自动化工具</p>
    </div>`;

  return sendEmail(to, subject, html);
}
