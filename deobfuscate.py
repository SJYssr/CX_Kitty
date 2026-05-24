import re, json, base64

with open("/tmp/index.js", "r", errors="ignore") as f:
    data = f.read()

print(f"原始大小: {len(data)} bytes")

# The JS uses a custom obfuscation pattern:
# _0x1234 = a0_0x2bbd; (the decode function)
# a0_0x2bbd() returns string from an array

# Let's find the string array first
# Pattern: var a0_0x1b69 = [...] or similar
str_array_match = re.search(r'var\s+\w+\s*=\s*\[([^\]]+)\]', data)
if str_array_match:
    # Try to extract the decode function
    pass

# Let's try to find functions related to enc/sign/datalog
# Search for patterns that might reveal the enc calculation

lines = data.split("\n")
print(f"\n总行数: {len(lines)}")

# Find strings that look like URL parameters
url_params = re.findall(r'["\'](enc|dtoken|md5|sign|sha|hmac|crypto|playingTime|duration|clipTime)["\']', data, re.I)
print(f"\n关键词出现次数:")
for k in set(url_params):
    print(f"  {k}: {url_params.count(k)}")

# Try to find the sendReadZTMediaLog function
func_match = re.search(r'function\s+sendReadZTMediaLog\s*\([^)]+\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}', data, re.I)
if func_match:
    print(f"\n=== sendReadZTMediaLog 函数 ({len(func_match.group(1))} bytes) ===")
    code = func_match.group(0)
    # Print first 500 chars
    print(code[:500])
    print("...")
else:
    print("\n未找到 sendReadZTMediaLog 函数")
    
    # Search for it differently
    for m in re.finditer(r'sendReadZTMediaLog', data):
        pos = m.start()
        print(f"\n找到 sendReadZTMediaLog 在位置 {pos}")
        print(data[pos:pos+300])
        break

# Try to find the enc calculation
enc_match = re.search(r'enc[^=]{0,20}=[^;]{0,100}', data, re.I)
if enc_match:
    print(f"\n=== enc 赋值 ===")
    for m in re.finditer(r'(?:enc|"enc"|['"'"']enc['"'"'])\s*(?::|=)\s*["'"']?([^"'",;\]\)]{3,50})', data, re.I):
        print(f"  {m.group()[:100]}")

# Check if there's an md5 function
md5_refs = re.findall(r'\.md5\s*\(|md5\s*\(|\.MD5|MD5\(', data, re.I)
print(f"\nmd5引用: {len(md5_refs)}")

# Check for crypto-js
if "crypto" in data.lower() or "CryptoJS" in data:
    print("包含 CryptoJS 引用")
    
# Try to find the log sending function
log_funcs = re.findall(r'function\s+\w*(?:log|heart|report|send|upload)\w*\s*\(', data, re.I)
print(f"\n日志相关函数: {log_funcs[:20]}")
