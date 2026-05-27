#!/usr/bin/env node
/**
 * CX_Kitty — 超星学习通全自动刷课工具
 * 主入口 CLI
 * @module index
 */

import { createShared } from './core/factory.js';
import { SessionManager } from './core/session.js';
import { JobProcessor } from './tasks/processor.js';
import { TikuDeepSeek } from './tiku/deepseek.js';
import logger, { setPrefix } from './utils/logger.js';

// ===================== 命令行解析 =====================

/**
 * 解析命令行参数
 * @returns {Object}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    phone: '',
    password: '',
    courses: [],       // 课程ID列表
    speed: 1,
    jobs: 3,
    notopenAction: 'continue',
    configFile: '',
    taskId: '',
    tiku: {
      provider: 'deepseek',
      submit: false,
      coverRate: 0.8,
      disabled: false,
      model: 'deepseek-v4-flash'
    }
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-u':
        opts.phone = args[++i] || '';
        break;
      case '-p':
        opts.password = args[++i] || '';
        break;
      case '-l':
        opts.courses = (args[++i] || '').split(',').filter(Boolean);
        break;
      case '-s':
        opts.speed = parseFloat(args[++i]) || 1;
        break;
      case '-j':
        opts.jobs = parseInt(args[++i], 10) || 3;
        break;
      case '-a':
        opts.notopenAction = args[++i] === 'retry' ? 'retry' : 'continue';
        break;
      case '-c':
        opts.configFile = args[++i] || '';
        break;
      case '--tk-submit':
        opts.tiku.submit = true;
        break;
      case '--tk-cover':
        opts.tiku.coverRate = parseFloat(args[++i]) || 0.8;
        break;
      case '--tk-model':
        opts.tiku.model = args[++i] || 'deepseek-v4-flash';
        break;
      case '--tk-disable':
        opts.tiku.disabled = true;
        break;
      case '--task-id':
        opts.taskId = args[++i] || '';
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
      default:
        break;
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
  🐱 CX_Kitty — 超星学习通自动刷课

  用法:
    node src/index.js [选项]

  选项:
    -u <手机号>        登录手机号
    -p <密码>          登录密码
    -l <课程ID>        课程ID列表 (逗号分隔, 如 "123,456")
    -s <倍速>          倍速 (默认 1)
    -j <并发数>        并行章节数 (默认 3)
    -a <retry|continue> 未开放章节处理 (默认 continue)
    -c <配置文件>       JSON 配置文件路径

  题库选项:
    --tk-submit              启用自动提交
    --tk-cover <0.0-1.0>     最低覆盖率 (默认 0.8)
    --tk-model <模型名>       DeepSeek 模型名 (默认 deepseek-v4-flash)
    --tk-disable             禁用 AI 答题

  DeepSeek AI 答题:
    默认使用 DeepSeek 进行 AI 答题，需配置环境变量:
    DEEPSEEK_API_KEY=sk-xxx

  示例:
    DEEPSEEK_API_KEY=sk-xxx node src/index.js -u 13800138000 -p mypassword
    DEEPSEEK_API_KEY=sk-xxx node src/index.js -u 13800138000 -p mypassword -l 12345678 -s 2 -j 5 --tk-submit
    DEEPSEEK_API_KEY=sk-xxx node src/index.js -u 13800138000 -p mypassword --tk-model deepseek-v4-pro --tk-disable
`);
}

// ===================== 初始化题库 =====================

/**
 * 初始化题库
 * @param {Object} cliOpts
 * @returns {TikuDeepSeek|null}
 */
function initTiku(cliOpts) {
  if (cliOpts.disabled) {
    logger.info('AI 答题已禁用');
    return null;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY || '';
  if (!apiKey) {
    logger.warn('未设置 DEEPSEEK_API_KEY 环境变量，答题功能将跳过');
    return null;
  }

  const deepseek = new TikuDeepSeek(apiKey, cliOpts.model || 'deepseek-v4-flash');
  deepseek.initTiku({
    SUBMIT: cliOpts.submit,
    COVER_RATE: cliOpts.coverRate
  });
  return deepseek;
}

// ===================== 主流程 =====================

async function main() {
  const cliOpts = parseArgs();

  console.log('\n  🐱 CX_Kitty v1.3 — 全自动刷课\n');

  // 加载配置文件
  let fileConfig = null;
  if (cliOpts.configFile) {
    const fs = await import('fs');
    const path = await import('path');
    const fullPath = path.resolve(cliOpts.configFile);
    try {
      if (fs.existsSync(fullPath)) {
        fileConfig = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        logger.info(`加载配置: ${fullPath}`);
      }
    } catch (err) {
      logger.warn(`配置文件加载失败: ${err.message}`);
    }
  }

  // 合并配置: 命令行 > 配置文件
  const phone = cliOpts.phone || (fileConfig && fileConfig.phone) || '';
  const password = cliOpts.password || (fileConfig && fileConfig.password) || '';

  if (!phone || !password) {
    logger.error('请提供手机号和密码 (-u -p)');
    printHelp();
    process.exit(1);
  }

  // 初始化 session
  new SessionManager();

  // 初始化题库
  const tikuConfig = cliOpts.tiku;
  if (fileConfig && fileConfig.tiku) {
    Object.assign(tikuConfig, fileConfig.tiku);
  }
  const tiku = initTiku(tikuConfig);
  if (tiku) {
    logger.info('AI答题: DeepSeek');
  }

  // 初始化 Chaoxing
  const chaoxing = createShared({ phone, password }, {
    tiku,
    speed: cliOpts.speed,
    jobs: cliOpts.jobs
  });
  chaoxing.notopenAction = cliOpts.notopenAction;

  if (cliOpts.taskId) chaoxing._taskId = cliOpts.taskId;

  // 登录 (优先用 cookies)
  const loginResult = await chaoxing.login(true);
  if (!loginResult.status) {
    logger.error(`登录失败: ${loginResult.msg}`);
    process.exit(1);
  }

  // 获取课程列表
  const courses = await chaoxing.getCourseList();
  if (!courses.length) {
    logger.error('未找到课程');
    process.exit(1);
  }

  // 筛选课程
  let targetCourses = courses;
  if (cliOpts.courses.length > 0) {
    targetCourses = courses.filter(c => cliOpts.courses.includes(c.courseId));
    if (!targetCourses.length) {
      logger.error('未找到指定课程');
      console.log('\n可用课程:');
      courses.forEach((c, i) => {
        console.log(`  ${i + 1}. [${c.courseId}] ${c.title}  ${c.teacher}`);
      });
      process.exit(1);
    }
  }

  console.log(`\n目标课程: ${targetCourses.map(c => c.title).join(', ')}`);
  console.log(`倍速: ${cliOpts.speed}x  并行: ${cliOpts.jobs}\n`);

  // 逐课程处理
  for (const course of targetCourses) {
    setPrefix(course.title);

    console.log(`\n${'='.repeat(50)}`);
    console.log(`  课程: ${course.title}`);
    console.log(`  教师: ${course.teacher}`);
    console.log(`${'='.repeat(50)}\n`);

    // 获取章节
    const { points } = await chaoxing.getCoursePoint(course.courseId, course.clazzId, course.cpi);

    if (!points.length) {
      logger.warn('无章节');
      continue;
    }

    // 创建处理器并执行
    const processor = new JobProcessor(chaoxing, course, points, {
      speed: cliOpts.speed,
      jobs: cliOpts.jobs,
      notopenAction: cliOpts.notopenAction
    });

    await processor.run();

    if (process.send && chaoxing._taskId) {
      process.send({
        type: 'course_done',
        taskId: chaoxing._taskId,
        course: course.title,
        courseId: course.courseId
      });
    }
  }

  if (process.send && chaoxing._taskId) {
    process.send({ type: 'all_done', taskId: chaoxing._taskId });
  }

  console.log('\n🎉 全部课程处理完成!\n');
}

// 启动
main().catch(err => {
  logger.error(`程序异常: ${err.message}`);
  console.error(err);
  process.exit(1);
});
