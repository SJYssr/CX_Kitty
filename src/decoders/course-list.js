/**
 * 课程列表 HTML → JSON 解析器
 * @module decoders/course-list
 */

import * as cheerio from 'cheerio';

/**
 * 解析课程列表页面 HTML
 * @param {string} html — 课程列表页面 HTML
 * @returns {Array<{clazzId: string, courseId: string, cpi: string, title: string, desc: string, teacher: string, isEnd: boolean}>}
 */
export function parseCourseList(html) {
  const $ = cheerio.load(html);
  const courses = [];

  $('div.course.clearfix').each((_, el) => {
    const $el = $(el);

    // 跳过不可选课程
    if ($el.find('a.not-open-tip').length || $el.find('div.not-open-tip').length) return;
    if ($el.text().includes('课程已结束')) return;

    const href = $el.find('a').attr('href') || '';
    const cpiMatch = href.match(/cpi=([^&]+)/);

    const title = $el.find('span.course-name').attr('title')?.trim() || '';
    if (!title) return;

    courses.push({
      clazzId: $el.find('input.clazzId').val() || '',
      courseId: $el.find('input.courseId').val() || '',
      cpi: cpiMatch ? cpiMatch[1] : '',
      title,
      desc: $el.find('p.margint10').attr('title')?.trim() || '',
      teacher: $el.find('p.color3').attr('title')?.trim() || '',
      isEnd: $el.text().includes('课程已结束')
    });
  });

  return courses;
}
