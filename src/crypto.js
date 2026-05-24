import crypto from "crypto";

export function getEnc(clazzId, userid, jobid, objectId, playingTime, duration) {
  const raw = `[${clazzId}][${userid}][${jobid}][${objectId}][${playingTime * 1000}][d_yHJ!$pdA~5][${duration * 1000}][0_${duration}]`;
  return crypto.createHash("md5").update(raw).digest("hex");
}

export function getTimestamp() {
  return String(Date.now());
}
