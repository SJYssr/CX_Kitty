import { EventEmitter } from 'events';
const bus = new EventEmitter();
bus.setMaxListeners(1000);

// 当前活跃视频进度缓存（taskId → { name → { name, currentTime, duration } }），支持并发多视频
bus._videoCache = new Map();

/** 获取某任务所有活跃视频进度 */
bus.getActiveVideos = function (taskId) {
  const map = bus._videoCache.get(taskId);
  return map ? [...map.values()] : [];
};

/** 更新单个视频进度 */
bus.updateVideo = function (taskId, data) {
  let map = bus._videoCache.get(taskId);
  if (!map) { map = new Map(); bus._videoCache.set(taskId, map); }
  map.set(data.name, { name: data.name, currentTime: data.currentTime, duration: data.duration });
};

/** 标记视频完成（从活跃列表移除）*/
bus.removeVideo = function (taskId, videoName) {
  const map = bus._videoCache.get(taskId);
  if (map) { map.delete(videoName); if (map.size === 0) bus._videoCache.delete(taskId); }
};

export default bus;
