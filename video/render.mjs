import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import fs from "fs";
const out = process.argv[2], fps = 30;
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto("file://" + process.cwd() + "/explainer.html");
const total = await p.evaluate(() => window.TOTAL);
const n = Math.round(total * fps);
for (let i = 0; i < n; i++) {
  await p.evaluate((t) => window.render(t), i / fps);
  await p.screenshot({ path: `${out}/f${String(i).padStart(5, "0")}.png` });
}
await b.close();
console.log("frames", n, "seconds", total);
