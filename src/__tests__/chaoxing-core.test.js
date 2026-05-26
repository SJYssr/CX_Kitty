/**
 * 测试 Chaoxing 核心方法（mock axios 模拟 HTTP）
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

describe('Chaoxing 核心方法', () => {
  let Chaoxing, StudyResult;

  beforeAll(async () => {
    const mod = await import('../core/chaoxing.js');
    Chaoxing = mod.Chaoxing;
    const sr = await import('../core/study-result.js');
    StudyResult = sr.StudyResult;
  });

  function makeAx(overrides = {}) {
    const get = vi.fn();
    const post = vi.fn();
    return {
      interceptors: { response: { use: vi.fn() } },
      get, post,
      defaults: { jar: { getCookies: vi.fn().mockResolvedValue([]) } },
      ...overrides
    };
  }

  // ===================== login =====================
  describe('login', () => {
    it('密码登录成功应返回 status=true', async () => {
      const ax = makeAx();
      ax.post.mockResolvedValue({ status: 200, data: { status: true } });
      ax.get.mockResolvedValue({ status: 200, data: '正常页面' });
      const cx = new Chaoxing({ phone: '13800138000', password: 'test' }, null, { _standaloneSession: ax, fastMode: true });
      const r = await cx.login(false);
      expect(r.status).toBe(true);
    }, 15000);

    it('登录失败应返回 status=false', async () => {
      const ax = makeAx();
      ax.post.mockResolvedValue({ status: 200, data: { status: false, msg2: '密码错误' } });
      const cx = new Chaoxing({ phone: '13800138000', password: 'wrong' }, null, { _standaloneSession: ax, fastMode: true });
      const r = await cx.login(false);
      expect(r.status).toBe(false);
    }, 15000);

    it('网络异常应返回 status=false', async () => {
      const ax = makeAx();
      ax.post.mockRejectedValue(new Error('ECONNRESET'));
      const cx = new Chaoxing({ phone: '13800138000', password: 'test' }, null, { _standaloneSession: ax, fastMode: true });
      const r = await cx.login(false);
      expect(r.status).toBe(false);
    }, 15000);
  });

  // ===================== video =====================
  describe('studyVideo', () => {
    it('无 objectId 应直接跳过', async () => {
      const ax = makeAx();
      const cx = new Chaoxing({ phone: 'test', password: 'test' }, null, { _standaloneSession: ax, fastMode: true });
      const r = await cx.studyVideo({ courseId: 'C1', clazzId: 'C1' }, { jobid: 'J1', name: 'test' }, null);
      expect(r).toBe(StudyResult.SUCCESS);
    });

    it('获取视频状态失败应返回 ERROR', async () => {
      const ax = makeAx();
      ax.get.mockRejectedValue(new Error('超时'));
      const cx = new Chaoxing({ phone: 'test', password: 'test' }, null, { _standaloneSession: ax, fastMode: true });
      const r = await cx.studyVideo({ courseId: 'C1', clazzId: 'C1' }, { jobid: 'J1', name: 'test', objectid: 'O1' }, null);
      expect(r).toBe(StudyResult.ERROR);
    }, 15000);

    it('download 类型应返回 SUCCESS', async () => {
      const ax = makeAx();
      ax.get.mockResolvedValue({ status: 200, data: { download: true, filename: 'x.png' } });
      const cx = new Chaoxing({ phone: 'test', password: 'test' }, null, { _standaloneSession: ax, fastMode: true });
      const r = await cx.studyVideo({ courseId: 'C1', clazzId: 'C1' }, { jobid: 'J1', name: 'test', objectid: 'O1' }, null);
      expect(r).toBe(StudyResult.SUCCESS);
    }, 15000);
  });

  // ===================== work =====================
  describe('studyWork', () => {
    it('无 tiku 时应跳过', async () => {
      const ax = makeAx();
      const cx = new Chaoxing({ phone: 'test', password: 'test' }, null, { _standaloneSession: ax, fastMode: true });
      const r = await cx.studyWork({ courseId: 'C1', clazzId: 'C1' }, { jobid: 'work-test' }, null);
      expect(r).toBe(StudyResult.SUCCESS);
    });
  });
});
