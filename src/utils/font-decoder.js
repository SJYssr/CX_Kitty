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

  // 康煕部首 → 标准汉字（Samueli924/chaoxing 移植）
  result = replaceKangxiRadicals(result);

  return result;
}

// 康煕部首替换表
const KX_RADICALS = {
  '\u2F00':'\u4E00','\u2F01':'\u4E28','\u2F02':'\u4E36','\u2F03':'\u4E3F','\u2F04':'\u4E59','\u2F05':'\u4E85',
  '\u2F06':'\u4E8C','\u2F07':'\u4EA0','\u2F08':'\u4EBA','\u2F09':'\u513F','\u2F0A':'\u5165','\u2F0B':'\u516B',
  '\u2F0C':'\u5182','\u2F0D':'\u5196','\u2F0E':'\u51AB','\u2F0F':'\u51E0','\u2F10':'\u51F5','\u2F11':'\u5200',
  '\u2F12':'\u529B','\u2F13':'\u52F9','\u2F14':'\u5315','\u2F15':'\u531A','\u2F16':'\u5338','\u2F17':'\u5341',
  '\u2F18':'\u535C','\u2F19':'\u5369','\u2F1A':'\u5382','\u2F1B':'\u53B6','\u2F1C':'\u53C8','\u2F1D':'\u53E3',
  '\u2F1E':'\u56D7','\u2F1F':'\u571F','\u2F20':'\u58EB','\u2F21':'\u5902','\u2F22':'\u590A','\u2F23':'\u5915',
  '\u2F24':'\u5927','\u2F25':'\u5973','\u2F26':'\u5B50','\u2F27':'\u5B80','\u2F28':'\u5BF8','\u2F29':'\u5C0F',
  '\u2F2A':'\u5C22','\u2F2B':'\u5C38','\u2F2C':'\u5C6E','\u2F2D':'\u5C71','\u2F2E':'\u5DDB','\u2F2F':'\u5DE5',
  '\u2F30':'\u5DF1','\u2F31':'\u5DFE','\u2F32':'\u5E72','\u2F33':'\u5E7A','\u2F34':'\u5E7F','\u2F35':'\u5EF4',
  '\u2F36':'\u5EFE','\u2F37':'\u5F0B','\u2F38':'\u5F13','\u2F39':'\u5F50','\u2F3A':'\u5F61','\u2F3B':'\u5F73',
  '\u2F3C':'\u5FC3','\u2F3D':'\u6208','\u2F3E':'\u6236','\u2F3F':'\u624B','\u2F40':'\u652F','\u2F41':'\u6534',
  '\u2F42':'\u6587','\u2F43':'\u6597','\u2F44':'\u659B','\u2F45':'\u65A4','\u2F46':'\u65B9','\u2F47':'\u65E0',
  '\u2F48':'\u65E5','\u2F49':'\u66F0','\u2F4A':'\u6708','\u2F4B':'\u6728','\u2F4C':'\u6B20','\u2F4D':'\u6B62',
  '\u2F4E':'\u6B79','\u2F4F':'\u6BB3','\u2F50':'\u6BCB','\u2F51':'\u6BD4','\u2F52':'\u6BDB','\u2F53':'\u6C0F',
  '\u2F54':'\u6C14','\u2F55':'\u6C34','\u2F56':'\u706B','\u2F57':'\u722A','\u2F58':'\u7236','\u2F59':'\u723B',
  '\u2F5A':'\u723F','\u2F5B':'\u7247','\u2F5C':'\u7259','\u2F5D':'\u725B','\u2F5E':'\u72AC','\u2F5F':'\u7384',
  '\u2F60':'\u7389','\u2F61':'\u74DC','\u2F62':'\u74E6','\u2F63':'\u7518','\u2F64':'\u751F','\u2F65':'\u7528',
  '\u2F66':'\u7530','\u2F67':'\u758B','\u2F68':'\u7592','\u2F69':'\u7676','\u2F6A':'\u767D','\u2F6B':'\u76AE',
  '\u2F6C':'\u76BF','\u2F6D':'\u76EE','\u2F6E':'\u77DB','\u2F6F':'\u77E2','\u2F70':'\u77F3','\u2F71':'\u793A',
  '\u2F72':'\u79B8','\u2F73':'\u79BE','\u2F74':'\u7A74','\u2F75':'\u7ACB','\u2F76':'\u7AF9','\u2F77':'\u7C73',
  '\u2F78':'\u7CF8','\u2F79':'\u7F36','\u2F7A':'\u7F51','\u2F7B':'\u7F8A','\u2F7C':'\u7FBD','\u2F7D':'\u8001',
  '\u2F7E':'\u800C','\u2F7F':'\u8012','\u2F80':'\u8033','\u2F81':'\u807F','\u2F82':'\u8089','\u2F83':'\u81E3',
  '\u2F84':'\u81EA','\u2F85':'\u81F3','\u2F86':'\u81FC','\u2F87':'\u820C','\u2F88':'\u821B','\u2F89':'\u821F',
  '\u2F8A':'\u826E','\u2F8B':'\u8272','\u2F8C':'\u8278','\u2F8D':'\u864D','\u2F8E':'\u866B','\u2F8F':'\u8840',
  '\u2F90':'\u884C','\u2F91':'\u8863','\u2F92':'\u897E','\u2F93':'\u898B','\u2F94':'\u898F','\u2F95':'\u89C1',
  '\u2F96':'\u89D2','\u2F97':'\u8A00','\u2F98':'\u8C37','\u2F99':'\u8C46','\u2F9A':'\u8C55','\u2F9B':'\u8C78',
  '\u2F9C':'\u8C9D','\u2F9D':'\u8D64','\u2F9E':'\u8D70','\u2F9F':'\u8DB3','\u2FA0':'\u8EAB','\u2FA1':'\u8ECA',
  '\u2FA2':'\u8F9B','\u2FA3':'\u8FB0','\u2FA4':'\u8FB5','\u2FA5':'\u9091','\u2FA6':'\u9149','\u2FA7':'\u91C6',
  '\u2FA8':'\u91CC','\u2FA9':'\u91D1','\u2FAA':'\u9577','\u2FAB':'\u9580','\u2FAC':'\u961C','\u2FAD':'\u96B6',
  '\u2FAE':'\u96B9','\u2FAF':'\u96E8','\u2FB0':'\u9751','\u2FB1':'\u975E','\u2FB2':'\u9762','\u2FB3':'\u9769',
  '\u2FB4':'\u97CB','\u2FB5':'\u97ED','\u2FB6':'\u97F3','\u2FB7':'\u9801','\u2FB8':'\u98A8','\u2FB9':'\u98DB',
  '\u2FBA':'\u98DF','\u2FBB':'\u9996','\u2FBC':'\u9999','\u2FBD':'\u99AC','\u2FBE':'\u9AA8','\u2FBF':'\u9AD8',
  '\u2FC0':'\u9ADF','\u2FC1':'\u9B25','\u2FC2':'\u9B2F','\u2FC3':'\u9B32','\u2FC4':'\u9B3C','\u2FC5':'\u9B5A',
  '\u2FC6':'\u9CE5','\u2FC7':'\u9E75','\u2FC8':'\u9E7F','\u2FC9':'\u9EA5','\u2FCA':'\u9EA6','\u2FCB':'\u9EBB',
  '\u2FCC':'\u9EC3','\u2FCD':'\u9ECD','\u2FCE':'\u9ED1','\u2FCF':'\u9EF9','\u2FD0':'\u9EFD','\u2FD1':'\u9F0E',
  '\u2FD2':'\u9F13','\u2FD3':'\u9F20','\u2FD4':'\u9F3B','\u2FD5':'\u9F4A','\u2FD6':'\u9F50','\u2FD7':'\u9F52',
  '\u2FD8':'\u9F7F','\u2FD9':'\u9F8D','\u2FDA':'\u9F99','\u2FDB':'\u9F9C','\u2FDC':'\u9FA0','\u34C3':'\u4E25',
  '\u34C4':'\u4E66','\u34C5':'\u4E70','\u34C6':'\u9F9F','\u34C7':'\u9F8B','\u34C8':'\u9F9F','\u34C9':'\u4ED1',
};

function replaceKangxiRadicals(text) {
  return [...text].map(ch => KX_RADICALS[ch] || ch).join('');
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
