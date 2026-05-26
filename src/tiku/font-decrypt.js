/**
 * 超星自定义字体解密 — 纯 JS 实现
 * 解析 TTF/WOFF 字体, 通过字形轮廓 MD5 hash 还原真实字符
 */

import { createRequire } from 'module';
import crypto from 'node:crypto';

const _require = createRequire(import.meta.url);
let opentype = null;

/**
 * 获取字体中每个字形轮廓的 MD5 hash 映射
 * @param {Buffer} fontData — TTF/WOFF 字体二进制数据
 * @returns {Object|null} — { 'uniXXXX': 'md5hash', ... } 或 null
 */
export function font2map(fontData) {
  try {
    if (!opentype) opentype = _require('opentype.js');
    const font = opentype.parse(new Uint8Array(fontData.buffer || fontData));
    const result = {};

    // 遍历字体中所有字形
    const glyphNames = font.glyphs.names;
    for (const name of glyphNames) {
      const glyph = font.glyphs.get(name);
      if (!glyph || !glyph.points || !glyph.numberOfContours) continue;

      // 重建 endPtsOfContours (opentype.js 不直接暴露, 从 lastPointOfContour 推导)
      const endPts = [];
      for (let i = 0; i < glyph.points.length; i++) {
        if (glyph.points[i].lastPointOfContour) {
          endPts.push(i);
        }
      }
      // 兼容处理: 如果 contours 数量和 endPts 不一致则跳过
      if (endPts.length !== glyph.numberOfContours) continue;

      // 拼接轮廓数据
      const parts = [];
      let last = 0;
      for (let ci = 0; ci < endPts.length; ci++) {
        for (let j = last; j <= endPts[ci]; j++) {
          const p = glyph.points[j];
          parts.push('' + p.x + p.y + (p.onCurve ? 1 : 0));
        }
        last = endPts[ci] + 1;
      }
      result[name] = crypto.createHash('md5').update(parts.join('')).digest('hex');
    }
    return result;
  } catch (e) {
    return null;
  }
}

// 加载预计算的字体映射表 (glyphHash → glyphName)
let _fontMap = null;
let _hashMap = null;

function loadFontMap() {
  if (_fontMap) return;
  const fs = _require('fs');
  const path = _require('path');
  const mapPath = path.resolve(new URL('font_map_table.json', import.meta.url).pathname);
  _fontMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  // 构建反向映射: glyphHash → glyphName
  _hashMap = {};
  for (const [k, v] of Object.entries(_fontMap)) {
    _hashMap[v] = k;
  }
}

/**
 * 康熙部首替换表
 */
const KX_RADICALS_TAB = {
  '⼀': '一', '⼁': '丨', '⼂': '丶', '⼃': '丿', '⼄': '乙', '⼅': '亅',
  '⼆': '二', '⼇': '亠', '⼈': '人', '⼉': '儿', '⼊': '入', '⼋': '八',
  '⼌': '冂', '⼍': '冖', '⼎': '冫', '⼏': '几', '⼐': '凵', '⼑': '刀',
  '⼒': '力', '⼓': '勹', '⼔': '匕', '⼕': '匚', '⼖': '匸', '⼗': '十',
  '⼘': '卜', '⼙': '卩', '⼚': '厂', '⼛': '厶', '⼜': '又', '⼝': '口',
  '⼞': '囗', '⼟': '土', '⼠': '士', '⼡': '夂', '⼢': '夊', '⼣': '夕',
  '⼤': '大', '⼥': '女', '⼦': '子', '⼧': '宀', '⼨': '寸', '⼩': '小',
  '⼪': '尢', '⼫': '尸', '⼬': '屮', '⼭': '山', '⼮': '巛', '⼯': '工',
  '⼰': '己', '⼱': '巾', '⼲': '干', '⼳': '幺', '⼴': '广', '⼵': '廴',
  '⼶': '廾', '⼷': '弋', '⼸': '弓', '⼹': '彐', '⼺': '彡', '⼻': '彳',
  '⼼': '心', '⼽': '戈', '⼾': '戶', '⼿': '手', '⽀': '支', '⽁': '攴',
  '⽂': '文', '⽃': '斗', '⽄': '斤', '⽅': '方', '⽆': '无', '⽇': '日',
  '⽈': '曰', '⽉': '月', '⽊': '木', '⽋': '欠', '⽌': '止', '⽍': '歹',
  '⽎': '殳', '⽏': '毋', '⽐': '比', '⽑': '毛', '⽒': '氏', '⽓': '气',
  '⽔': '水', '⽕': '火', '⽖': '爪', '⽗': '父', '⽘': '爻', '⽙': '爿',
  '⽚': '片', '⽛': '牙', '⽜': '牛', '⽝': '犬', '⽞': '玄', '⽟': '玉',
  '⽠': '瓜', '⽡': '瓦', '⽢': '甘', '⽣': '生', '⽤': '用', '⽥': '田',
  '⽦': '疋', '⽧': '疒', '⽨': '癶', '⽩': '白', '⽪': '皮', '⽫': '皿',
  '⽬': '目', '⽭': '矛', '⽮': '矢', '⽯': '石', '⽰': '示', '⽱': '禸',
  '⽲': '禾', '⽳': '穴', '⽴': '立', '⽵': '竹', '⽶': '米', '⽷': '糸',
  '⽸': '缶', '⽹': '网', '⽺': '羊', '⽻': '羽', '⽼': '老', '⽽': '而',
  '⽾': '耒', '⽿': '耳', '⾀': '聿', '⾁': '肉', '⾂': '臣', '⾃': '自',
  '⾄': '至', '⾅': '臼', '⾆': '舌', '⾇': '舛', '⾈': '舟', '⾉': '艮',
  '⾊': '色', '⾋': '艸', '⾌': '虍', '⾍': '虫', '⾎': '血', '⾏': '行',
  '⾐': '衣', '⾑': '襾', '⾒': '見', '⾓': '角', '⾔': '言', '⾕': '谷',
  '⾖': '豆', '⾗': '豕', '⾘': '豸', '⾙': '貝', '⾚': '赤', '⾛': '走',
  '⾜': '足', '⾝': '身', '⾞': '車', '⾟': '辛', '⾠': '辰', '⾡': '辵',
  '⾢': '邑', '⾣': '酉', '⾤': '采', '⾥': '里', '⾦': '金', '⾧': '長',
  '⾨': '門', '⾩': '阜', '⾪': '隶', '⾫': '隹', '⾬': '雨', '⾭': '青',
  '⾮': '非', '⾯': '面', '⾰': '革', '⾱': '韋', '⾲': '韭', '⾳': '音',
  '⾴': '頁', '⾵': '風', '⾶': '飛', '⾷': '食', '⾸': '首', '⾹': '香',
  '⾺': '馬', '⾻': '骨', '⾼': '高', '⾽': '髟', '⾾': '鬥', '⾿': '鬯',
  '⿀': '鬲', '⿁': '鬼', '⿂': '魚', '⿃': '鳥', '⿄': '鹵', '⿅': '鹿',
  '⿆': '麥', '⿇': '麻', '⿈': '黃', '⿉': '黍', '⿊': '黑', '⿋': '黹',
  '⿌': '黽', '⿍': '鼎', '⿎': '鼓', '⿏': '鼠', '⿐': '鼻', '⿑': '齊',
  '⿒': '齒', '⿓': '龍', '⿔': '龟', '⿕': '龠',
};

/**
 * 解密被超星自定义字体替换的文本
 * @param {Object} glyfMap — font2map() 返回的 { 'uniXXXX': 'md5hash' }
 * @param {string} garbled — 乱码文本
 * @returns {string} — 解密后的文本
 */
export function decrypt(glyfMap, garbled) {
  if (!glyfMap || !garbled) return garbled || '';
  loadFontMap();

  const result = [];
  for (const ch of garbled) {
    const chHash = glyfMap[`uni${ch.charCodeAt(0).toString(16).toUpperCase()}`];
    if (chHash && _hashMap[chHash]) {
      const oriGlyph = _hashMap[chHash];
      if (oriGlyph && oriGlyph.startsWith('uni')) {
        result.push(String.fromCharCode(parseInt(oriGlyph.slice(3), 16)));
        continue;
      }
    }
    result.push(ch);
  }

  // 替换康熙部首
  return result.map(c => KX_RADICALS_TAB[c] || c).join('');
}
