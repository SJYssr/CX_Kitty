import { readFileSync, writeFileSync } from "fs";

// Load the obfuscated JS
let code = readFileSync("/tmp/index.js", "utf-8");

// Extract the string array: var a0_0x1b69 = [...]
// The obfuscation pattern is: a0_0x3aa785 calls a0_0x2bbd with an index
// a0_0x2bbd looks up the string from a shifted array

// Try to run the code in Node.js VM with mock browser objects
import vm from "vm";

// Create mock browser environment
const context = {
  window: { location: { href: "https://mooc1.chaoxing.com/ananas/modules/video/index.html" } },
  document: { cookie: "", getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  top: { location: { href: "https://mooc1.chaoxing.com/ananas/modules/video/index.html" } },
  parent: { location: { href: "https://mooc1.chaoxing.com/ananas/modules/video/index.html" } },
  location: { href: "https://mooc1.chaoxing.com/ananas/modules/video/index.html", search: "" },
  navigator: { userAgent: "Mozilla/5.0" },
  console: console,
  setTimeout: setTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  clearTimeout: clearTimeout,
  Ext: { Ajx: { request: (...args) => console.log("Ext.Ajax.request called:", JSON.stringify(args).slice(0, 300)) }, get: () => ({ setHTML: () => {} }) },
  window: global,
  global: global,
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  Boolean: Boolean,
  RegExp: RegExp,
  Math: Math,
  JSON: JSON,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  isFinite: isFinite,
  encodeURIComponent: encodeURIComponent,
  decodeURIComponent: decodeURIComponent,
  Date: Date,
  Error: Error,
  TypeError: TypeError,
  eval: eval
};

// Wrap the code to expose the a0_0x3aa785 function
const wrappedCode = `
${code}

// Try to expose the decode function
try {
  if (typeof a0_0x3aa785 === "function") {
    globalThis._decode = a0_0x3aa785;
    globalThis._codeLen = ${code.length};
    // Also try to expose the string array
    try { globalThis._stringArray = a0_0x1b69; } catch(e) {}
  }
} catch(e) {
  console.log("Error exposing decode:", e.message);
}
`;

try {
  const script = new vm.Script(wrappedCode, { timeout: 5000 });
  script.runInNewContext(context, { timeout: 5000 });
  
  if (context._decode) {
    // Try decoding some indices
    console.log("=== Decode function found! ===");
    const indices = [0xcc, 0x151, 0x163, 0x179, 0x196, 0x228, 0x232, 0x254, 0x26c, 0x2b9, 0x2da, 0x301, 0x313, 0x31f, 0x333, 0x340, 0x371, 0x372, 0x37b, 0x38a];
    for (const idx of indices) {
      try {
        const val = context._decode(idx.toString());
        console.log(`  _decode(0x${idx.toString(16).padStart(3, "0")}) = "${val}"`);
      } catch(e) {
        console.log(`  _decode(0x${idx.toString(16).padStart(3, "0")}) = ERROR`);
      }
    }
  } else {
    console.log("Decode function not exposed");
    
    // Try to find what's available
    const keys = Object.keys(context).filter(k => k.startsWith("_") || k.startsWith("a0"));
    console.log("Available keys:", keys.slice(0, 20));
  }
} catch(e) {
  console.error("VM Error:", e.message);
}
