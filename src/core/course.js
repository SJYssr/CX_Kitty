/**
 * 超星 Course 模块 — 课程列表、章节、任务卡片
 */
import { parseCourseList } from '../decoders/course-list.js';
import { parseCoursePoint } from '../decoders/course-point.js';
import { parseCourseCard } from '../decoders/course-card.js';
import logger from '../utils/logger.js';
import cfg from '../config.js';

/** @param {Function} ChaoxingClass */
export function applyCourse(ChaoxingClass) {
  const proto = ChaoxingClass.prototype;

  proto.getCourseList = async function () {
    try {
      await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
      const resp = await this.axios.post(
        'https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata',
        new URLSearchParams({ courseType: '1', courseFolderId: '0', query: '', superstarClass: '0' }).toString(),
        { headers: { ...cfg.headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
      await this.axios.get('https://mooc2-ans.chaoxing.com/mooc2-ans/visit/interaction', {
        headers: cfg.headers
      }).catch(() => {});

      await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
      const resp2 = await this.axios.post(
        'https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata',
        new URLSearchParams({ courseType: '1', courseFolderId: '0', query: '', superstarClass: '0' }).toString(),
        { headers: { ...cfg.headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const html = typeof resp2.data === 'string' ? resp2.data : '';
      const courses = parseCourseList(html);

      logger.info(`获取到 ${courses.length} 门课程`);
      return courses;
    } catch (err) {
      logger.error(`获取课程失败: ${err.message}`);
      return [];
    }
  };

  proto.getCoursePoint = async function (courseId, clazzId, cpi) {
    try {
      const url = `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=${courseId}&clazzid=${clazzId}&cpi=${cpi}&ut=s`;

      await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
      const resp = await this.axios.get(url, { headers: cfg.headers });

      const html = typeof resp.data === 'string' ? resp.data : '';
      const result = parseCoursePoint(html);

      logger.info(`章节解析: ${result.points.length} 个章节`);
      return result;
    } catch (err) {
      logger.error(`获取章节失败: ${err.message}`);
      return { hasLocked: false, points: [] };
    }
  };

  proto.getJobList = async function (course, point) {
    const allJobs = [];
    let jobInfo = null;
    const maxRetries = 6;

    this._currentKnowledgeId = point.id;

    for (let num = 0; num < maxRetries; num++) {
      const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${course.clazzId}&courseid=${course.courseId}&knowledgeid=${point.id}&num=${num}&ut=s&cpi=${course.cpi}&v=2025-0424-1038-3&mooc2=1`;

      try {
        await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
        const resp = await this.axios.get(url, { headers: cfg.videoHeaders });
        const html = typeof resp.data === 'string' ? resp.data : '';

        const parsed = parseCourseCard(html);
        if (!parsed) {
          if (num === 0) return { jobs: [], jobInfo: null, notOpen: false };
          break;
        }

        if (parsed.notOpen) {
          return { jobs: [], jobInfo: null, notOpen: true };
        }

        if (parsed.jobInfo) jobInfo = parsed.jobInfo;
        allJobs.push(...parsed.jobs);
      } catch (_) {
        logger.warn('获取 course point 任务失败: ' + (_.message || _));
        break;
      }
    }

    for (const j of allJobs) {
      j.knowledgeid = (jobInfo && jobInfo.knowledgeid) || point.id;
    }

    return { jobs: allJobs, jobInfo, notOpen: false };
  };
}
