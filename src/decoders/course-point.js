/**
 * 章节列表 HTML → JSON 解析器
 * @module decoders/course-point
 */

import * as cheerio from 'cheerio';

/**
 * 解析章节页面 HTML
 * @param {string} html — 学生课程页面 HTML
 * @returns {{ hasLocked: boolean, points: Array<{id: string, title: string, jobCount: number, hasFinished: boolean, needUnlock: boolean}> }}
 */
export function parseCoursePoint(html) {
  const $ = cheerio.load(html);
  const points = [];
  let hasLocked = false;

  // 检查是否有锁定提示
  if ($('div.locked').length || html.includes('章节未开放')) {
    hasLocked = true;
  }

  $('div.chapter_unit').each((_, unit) => {
    $(unit).find('div[id^=cur]').each((_, el) => {
      const $el = $(el);
      const idMatch = $el.attr('id')?.match(/^cur(\d+)$/);
      if (!idMatch) return;

      const id = idMatch[1];
      const title = ($el.attr('title') || $el.find('.catalog_title').text() || '').trim().replace(/\s+/g, ' ');
      if (!title) return;

      const jobCountVal = $el.find('input.knowledgeJobCount').val();
      const jobCount = jobCountVal ? parseInt(jobCountVal, 10) : 1;

      const tipsText = $el.find('span.bntHoverTips').text() || '';
      const hasFinished = tipsText.includes('已完成');
      const needUnlock = tipsText.includes('解锁');

      points.push({ id, title, jobCount, hasFinished, needUnlock });
    });
  });

  return { hasLocked, points };
}
