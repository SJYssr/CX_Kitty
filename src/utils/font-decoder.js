/**
 * 超星字体解密 — 提取 TTF 字形轮廓并映射回标准字符
 * 纯 Node.js 实现，无需 fonttools
 * @module utils/font-decoder
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP_PATH = path.resolve(__dirname, '../../map.json');

/** @type {Object.<string,string>|null} */
let _mapCache = null;

function loadMap() {
  if (_mapCache) return _mapCache;
  try {
    if (fs.existsSync(MAP_PATH)) {
      _mapCache = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
    } else {
      _mapCache = {};
    }
  } catch {
    _mapCache = {};
  }
  return _mapCache;
}

/**
 * 将 uniXXXX 格式的字形名转为实际字符
 */
function glyphToChar(name) {
  if (typeof name === 'string' && name.startsWith('uni') && name.length === 7) {
    try {
      return String.fromCodePoint(parseInt(name.slice(3), 16));
    } catch {}
  }
  return name;
}

/**
 * 解析 TTF 的 glyf 表，提取每个字形的轮廓点 MD5
 * 从 TTF 二进制直接解析，无需 fonttools
 * @param {Buffer} buf - TTF 文件内容
 * @returns {Object.<string,string>} glyphName -> md5
 */
function extractGlyphMD5s(buf) {
  // === 读取 offset table ===
  const sfVersion = buf.readUInt32BE(0);
  const numTables = buf.readUInt16BE(4);

  // 查找表目录
  let glyfOffset = 0, glyfLength = 0;
  let locaOffset = 0, locaLength = 0;
  let headOffset = 0;
  let nameOffset = 0, nameLength = 0;
  let postOffset = 0, postLength = 0;
  let maxpOffset = 0;
  let cmapOffset = 0, cmapLength = 0;

  for (let i = 0; i < numTables; i++) {
    const base = 12 + i * 16;
    const tag = buf.toString('ascii', base, base + 4);
    const offset = buf.readUInt32BE(base + 8);
    const length = buf.readUInt32BE(base + 12);
    if (tag === 'glyf') { glyfOffset = offset; glyfLength = length; }
    else if (tag === 'loca') { locaOffset = offset; locaLength = length; }
    else if (tag === 'head') { headOffset = offset; }
    else if (tag === 'name') { nameOffset = offset; nameLength = length; }
    else if (tag === 'post') { postOffset = offset; postLength = length; }
    else if (tag === 'maxp') { maxpOffset = offset; }
    else if (tag === 'cmap') { cmapOffset = offset; cmapLength = length; }
  }

  if (!glyfOffset || !locaOffset || !headOffset) {
    throw new Error('TTF: missing required tables (glyf/loca/head)');
  }

  // === read head: indexToLocFormat (bytes 50-51) ===
  const indexToLocFormat = buf.readUInt16BE(headOffset + 50);
  // === read maxp: numGlyphs ===
  const numGlyphs = maxpOffset ? buf.readUInt16BE(maxpOffset + 4) : 0;

  // === read loca: glyph offsets ===
  const locaEntries = [];
  for (let i = 0; i <= numGlyphs; i++) {
    if (indexToLocFormat === 0) {
      locaEntries.push(buf.readUInt16BE(locaOffset + i * 2) * 2);
    } else {
      locaEntries.push(buf.readUInt32BE(locaOffset + i * 4));
    }
  }

  // === read post table: glyph names (version 2 only) ===
  const glyphNames = [];
  const postVersion = postOffset ? buf.readUInt32BE(postOffset) : 0;
  if (postOffset && postVersion === 0x00020000) {
    // version 2: glyphNameIndex array
    const numGlyphNames = buf.readUInt16BE(postOffset + 34); // numberOfGlyphs (v2)
    let pos = postOffset + 36;
    const nameIndices = [];
    for (let i = 0; i < numGlyphNames && i < numGlyphs; i++) {
      nameIndices.push(buf.readUInt16BE(pos + i * 2));
    }
    pos += numGlyphNames * 2;
    // Read Pascal strings for indices >= 258
    const extraNames = {};
    const strCount = buf.readUInt16BE(pos); pos += 2;
    for (let i = 0; i < strCount; i++) {
      const len = buf.readUInt8(pos); pos += 1;
      const str = buf.toString('ascii', pos, pos + len); pos += len;
      // Pascal string at some offset - we need the glyph index... 
      // Actually post v2 is complex. Let's use a simpler approach.
      extraNames[258 + i] = str;
    }
  }

  // === read name table for glyph names (mac/win name records) ===
  // We'll try to extract glyph names from the "names" field in name table
  // Actually for the subsetted TTF, glyph names are in the post table

  // === Fallback: extract glyph names from post table (version 2 format) ===
  // Macintosh standard glyph names from the 'post' table
  const macGlyphNames = [
    '.notdef', '.null', 'nonmarkingreturn', 'space', 'exclam', 'quotedbl',
    'numbersign', 'dollar', 'percent', 'ampersand', 'quotesingle',
    'parenleft', 'parenright', 'asterisk', 'plus', 'comma', 'hyphen',
    'period', 'slash', 'zero', 'one', 'two', 'three', 'four', 'five',
    'six', 'seven', 'eight', 'nine', 'colon', 'semicolon', 'less',
    'equal', 'greater', 'question', 'at', 'A', 'B', 'C', 'D', 'E',
    'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R',
    'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'bracketleft', 'backslash',
    'bracketright', 'asciicircum', 'underscore', 'grave', 'a', 'b', 'c',
    'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p',
    'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'braceleft',
    'bar', 'braceright', 'asciitilde'
  ];

  // Try to read post table v2 names
  const postNames = postOffset && postOffset + 34 < buf.length ? (() => {
    const names = [];
    try {
      const nGlyphs = Math.min(numGlyphs, buf.readUInt16BE(postOffset + 32));
      let pos = postOffset + 34;
      const indices = [];
      for (let i = 0; i < nGlyphs; i++) {
        const idx = buf.readUInt16BE(pos + i * 2);
        indices.push(idx);
      }
      pos += nGlyphs * 2;
      // Extra Pascal strings
      const extraStrs = {};
      if (pos + 2 <= buf.length) {
        const nExtra = buf.readUInt16BE(pos); pos += 2;
        for (let i = 0; i < nExtra && pos < buf.length; i++) {
          const len = Math.min(buf.readUInt8(pos), buf.length - pos - 1);
          pos += 1;
          const str = buf.toString('ascii', pos, Math.min(pos + len, buf.length));
          pos += len;
          extraStrs[i] = str;
        }
      }
      for (let i = 0; i < nGlyphs; i++) {
        const idx = indices[i];
        if (idx < macGlyphNames.length) {
          names.push(macGlyphNames[idx]);
        } else if (extraStrs[idx - macGlyphNames.length]) {
          names.push(extraStrs[idx - macGlyphNames.length]);
        } else {
          names.push(`glyph${i}`);
        }
      }
    } catch { /* ignore */ }
    return names;
  })() : [];

  // === Read cmap table (format 4) for gid→unicode ===
  const gidToUnicode = {};
  if (cmapOffset) {
    const cmapVersion = buf.readUInt16BE(cmapOffset);
    const numEncodings = buf.readUInt16BE(cmapOffset + 2);
    for (let e = 0; e < numEncodings; e++) {
      const platformID = buf.readUInt16BE(cmapOffset + 4 + e * 8);
      const encodingID = buf.readUInt16BE(cmapOffset + 4 + e * 8 + 2);
      const subtableOff = buf.readUInt32BE(cmapOffset + 4 + e * 8 + 4);
      const format = buf.readUInt16BE(cmapOffset + subtableOff);
      if (format === 4) {
        const segCount = buf.readUInt16BE(cmapOffset + subtableOff + 6) / 2;
        let pos = cmapOffset + subtableOff + 14;
        const endCodes = [];
        for (let s = 0; s < segCount; s++) endCodes.push(buf.readUInt16BE(pos + s * 2));
        pos += segCount * 2 + 2;
        const startCodes = [];
        for (let s = 0; s < segCount; s++) startCodes.push(buf.readUInt16BE(pos + s * 2));
        pos += segCount * 2;
        const idDeltas = [];
        for (let s = 0; s < segCount; s++) idDeltas.push(buf.readInt16BE(pos + s * 2));
        pos += segCount * 2;
        const idRangeOffsetPos = pos;
        const idRangeOffsets = [];
        for (let s = 0; s < segCount; s++) idRangeOffsets.push(buf.readUInt16BE(pos + s * 2));
        for (let s = 0; s < segCount; s++) {
          if (startCodes[s] === 0xFFFF) break;
          if (idRangeOffsets[s] === 0) {
            for (let c = startCodes[s]; c <= endCodes[s]; c++) {
              gidToUnicode[(c + idDeltas[s]) & 0xFFFF] = c;
            }
          } else {
            for (let c = startCodes[s]; c <= endCodes[s]; c++) {
              const roff = idRangeOffsetPos + s * 2 + idRangeOffsets[s] + (c - startCodes[s]) * 2;
              const gid = buf.readUInt16BE(roff);
              if (gid !== 0) gidToUnicode[gid] = c;
            }
          }
        }
      }
    }
  }

  // === Parse glyf table ===
  const result = {};
  const coordCache = {};

  for (let gid = 0; gid < numGlyphs; gid++) {
    const offset = locaEntries[gid];
    const nextOffset = locaEntries[gid + 1];
    const length = nextOffset - offset;
    if (length <= 0) continue;

    const glyphStart = glyfOffset + offset;

    // Read glyph header
    const numContours = buf.readInt16BE(glyphStart);
    const xMin = buf.readInt16BE(glyphStart + 2);
    const yMin = buf.readInt16BE(glyphStart + 4);
    const xMax = buf.readInt16BE(glyphStart + 6);
    const yMax = buf.readInt16BE(glyphStart + 8);

    const points = [];

    if (numContours > 0) {
      // Simple glyph
      // Read endPtsOfContours
      const endPts = [];
      let pos = glyphStart + 10;
      for (let i = 0; i < numContours; i++) {
        endPts.push(buf.readUInt16BE(pos));
        pos += 2;
      }
      const totalPoints = endPts[numContours - 1] + 1;

      // Read instruction length
      const instructionLength = buf.readUInt16BE(pos);
      pos += 2 + instructionLength;

      // Read flags
      const flags = [];
      let i = 0;
      while (i < totalPoints) {
        const flag = buf.readUInt8(pos++);
        flags.push(flag);
        i++;
        // Repeat flag
        if (flag & 0x08) {
          const repeat = buf.readUInt8(pos++);
          for (let j = 0; j < repeat; j++) {
            flags.push(flag);
            i++;
          }
        }
      }

      // Read x coordinates
      const xs = [];
      let prevX = 0;
      for (let i = 0; i < totalPoints; i++) {
        const flag = flags[i];
        if (flag & 0x02) {
          // Short x (1 byte)
          const dx = buf.readUInt8(pos++);
          xs.push(flag & 0x10 ? prevX + dx : prevX - dx);
        } else if (flag & 0x10) {
          // Same x
          xs.push(prevX);
        } else {
          // Long x (2 bytes)
          const dx = buf.readInt16BE(pos);
          pos += 2;
          xs.push(prevX + dx);
        }
        prevX = xs[i];
      }

      // Read y coordinates
      const ys = [];
      let prevY = 0;
      for (let i = 0; i < totalPoints; i++) {
        const flag = flags[i];
        if (flag & 0x04) {
          // Short y (1 byte)
          const dy = buf.readUInt8(pos++);
          ys.push(flag & 0x20 ? prevY + dy : prevY - dy);
        } else if (flag & 0x20) {
          // Same y
          ys.push(prevY);
        } else {
          // Long y (2 bytes)
          const dy = buf.readInt16BE(pos);
          pos += 2;
          ys.push(prevY + dy);
        }
        prevY = ys[i];
      }

      // Build points
      for (let p = 0; p < totalPoints; p++) {
        const onCurve = (flags[p] & 0x01) ? 1 : 0;
        points.push(`${xs[p]}${ys[p]}${onCurve}`);
      }
    } else if (numContours < 0) {
      // Composite glyph — skip for now (the Chaoxing font uses simple glyphs)
      continue;
    }

    const raw = points.join('');
    const md5 = crypto.createHash('md5').update(raw).digest('hex');

    // Get glyph name from cmap or post table
    let glyphName;
    if (gidToUnicode[gid]) {
      glyphName = `uni${gidToUnicode[gid].toString(16).toUpperCase().padStart(4, '0')}`;
    } else if (gid < postNames.length && postNames[gid]) {
      glyphName = postNames[gid];
    } else {
      glyphName = `glyph${gid}`;
    }
    result[glyphName] = md5;
  }

  return result;
}

/**
 * 解码被字体加密的文本
 * @param {string} text — 含加密字符的原文
 * @param {Buffer} [ttfBuffer] — 页面上的 TTF 字体
 * @returns {string} — 解码后的文本
 */
export function decodeFontText(text, ttfBuffer) {
  if (!ttfBuffer || !text) return text;

  const map = loadMap();
  if (Object.keys(map).length === 0) return text;

  // Reverse map: md5 -> standard glyph name
  const md5ToStd = {};
  for (const [stdName, md5] of Object.entries(map)) {
    md5ToStd[md5] = stdName;
  }

  let glyphMD5s;
  try {
    glyphMD5s = extractGlyphMD5s(ttfBuffer);
  } catch (e) {
    return text;
  }

  // Build decode map: encrypted glyph name -> real character
  const decodeMap = {};
  for (const [encName, md5] of Object.entries(glyphMD5s)) {
    if (md5ToStd[md5]) {
      const stdName = md5ToStd[md5];
      if (stdName !== encName) {
        decodeMap[encName] = glyphToChar(stdName);
      }
    }
  }

  if (Object.keys(decodeMap).length === 0) return text;

  // Replace
  let result = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    const uniName = `uni${code.toString(16).toUpperCase().padStart(4, '0')}`;
    result += decodeMap[uniName] || char;
  }

  return result;
}

/**
 * 检测文本是否包含疑似加密字符
 * @param {string} text
 * @returns {boolean}
 */
export function hasEncodedChars(text) {
  if (!text) return false;
  for (const char of text) {
    const code = char.charCodeAt(0);
    // 超星加密常用的生僻汉字范围（非标准 CJK 常用字区域）
    if (code >= 0x5500 && code <= 0x5600) return true;
    if (code >= 0x5B2B && code <= 0x5B42) return true;
    if (code === 0x74D4 || code === 0x827F || code === 0x60DF) return true;
    if (code >= 0x5590 && code <= 0x55F0) return true;
  }
  return false;
}
