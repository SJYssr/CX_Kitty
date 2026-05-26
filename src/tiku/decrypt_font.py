#!/usr/bin/env python3
"""
超星自定义字体解密工具
用法: python3 decrypt_font.py <font_base64> <garbled_text>
输出: 解密后的文本
"""
import base64, hashlib, json, sys
from io import BytesIO

try:
    from fontTools.ttLib import TTFont
except ImportError:
    print("FONTTOOLS_MISSING", flush=True)
    sys.exit(1)

# 康熙部首替换表
KX_RADICALS_TAB = str.maketrans(
    "⼀⼁⼂⼃⼄⼅⼆⼇⼈⼉⼊⼋⼌⼍⼎⼏⼐⼑⼒⼓⼔⼕⼖⼗⼘⼙⼚⼛⼜⼝⼞⼟⼠⼡⼢⼣⼤⼥⼦⼧⼨⼩⼪⼫⼬⼭⼮⼯⼰⼱⼲⼳⼴⼵⼶⼷⼸⼹⼺⼻⼼⼽⼾⼿⽀⽁⽂⽃⽄⽅⽆⽇⽈⽉⽊⽋⽌⽍⽎⽏⽐⽑⽒⽓⽔⽕⽖⽗⽘⽙⽚⽛⽜⽝⽞⽟⽠⽡⽢⽣⽤⽥⽦⽧⽨⽩⽪⽫⽬⽭⽮⽯⽰⽱⽲⽳⽴⽵⽶⽷⽸⽹⽺⽻⽼⽽⽾⽿⾀⾁⾂⾃⾄⾅⾆⾇⾈⾉⾊⾋⾌⾍⾎⾏⾐⾑⾒⾓⾔⾕⾖⾗⾘⾙⾚⾛⾜⾝⾞⾟⾠⾡⾢⾣⾤⾥⾦⾧⾨⾩⾪⾫⾬⾭⾮⾯⾰⾱⾲⾳⾴⾵⾶⾷⾸⾹⾺⾻⾼髙⾽⾾⾿⿀⿁⿂⿃⿄⿅⿆⿇⿈⿉⿊⿋⿌⿍⿎⿏⿐⿑⿒⿓⿔⿕⺠⻬⻩⻢⻜⻅⺟⻓",
    "一丨丶丿乙亅二亠人儿入八冂冖冫几凵刀力勹匕匚匸十卜卩厂厶又口囗土士夂夊夕大女子宀寸小尢尸屮山巛工己巾干幺广廴廾弋弓彐彡彳心戈戶手支攴文斗斤方无日曰月木欠止歹殳毋比毛氏气水火爪父爻爿片牙牛犬玄玉瓜瓦甘生用田疋疒癶白皮皿目矛矢石示禸禾穴立竹米糸缶网羊羽老而耒耳聿肉臣自至臼舌舛舟艮色艸虍虫血行衣襾見角言谷豆豕豸貝赤走足身車辛辰辵邑酉采里金長門阜隶隹雨青非面革韋韭音頁風飛食首香馬骨高高髟鬥鬯鬲鬼魚鳥鹵鹿麥麻黃黍黑黹黽鼎鼓鼠鼻齊齒龍龟龠民齐黄马飞见母长"
)


def hash_glyph(glyph):
    """TTF字形曲线 -> MD5 hash"""
    pos_bin = ""
    last = 0
    for i in range(glyph.numberOfContours):
        for j in range(last, glyph.endPtsOfContours[i] + 1):
            pos_bin += f"{glyph.coordinates[j][0]}{glyph.coordinates[j][1]}{glyph.flags[j] & 0x01}"
        last = glyph.endPtsOfContours[i] + 1
    return hashlib.md5(pos_bin.encode()).hexdigest()


def load_font_map():
    """加载预计算的字体hash->字符映射表"""
    import os
    script_dir = os.path.dirname(os.path.abspath(__file__))
    map_path = os.path.join(script_dir, 'font_map_table.json')
    with open(map_path, 'r') as f:
        return json.load(f)


def main():
    if len(sys.argv) < 2:
        # stdin模式: 第一行font_base64, 第二行garbled_text
        font_b64 = sys.stdin.readline().strip()
        garbled = sys.stdin.readline().strip()
    else:
        font_b64 = sys.argv[1]
        garbled = sys.argv[2] if len(sys.argv) > 2 else sys.stdin.read().strip()

    if not font_b64 or not garbled:
        print(garbled, flush=True)
        return

    # 获取字体Hash映射表
    char_map = load_font_map()
    # 构建 hash->字符 的反向映射
    hash_map = {v: k for k, v in char_map.items()}

    # 解析字体 → glyph hash映射
    try:
        font_data = base64.b64decode(font_b64)
        font_file = BytesIO(font_data)
        with TTFont(font_file, lazy=False) as ft:
            glyf_table = ft["glyf"]
            glyf_map = {}
            for name in glyf_table.glyphOrder:
                glyf_map[name] = hash_glyph(glyf_table.glyphs[name])
    except Exception as e:
        # 字体解析失败, 返回原文
        print(garbled, flush=True)
        return

    # 解密文本
    result = []
    for ch in garbled:
        ch_hash = glyf_map.get(f"uni{ord(ch):X}")
        if ch_hash:
            ori_glyph = hash_map.get(ch_hash)
            if ori_glyph and ori_glyph.startswith("uni"):
                result.append(chr(int(ori_glyph[3:], 16)))
                continue
        result.append(ch)

    clean = "".join(result)
    # 替换康熙部首
    clean = clean.translate(KX_RADICALS_TAB)
    print(clean, flush=True)


if __name__ == "__main__":
    main()
