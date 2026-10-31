import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import fs from "fs";
const [out, tlPath, a, b, step] = process.argv.slice(2), fps = 30;
fs.mkdirSync(out, { recursive: true });
const TL = JSON.parse(fs.readFileSync(tlPath, "utf8"));
const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1920, height: 1080 } });
p.on("pageerror", e => console.log("PAGEERROR", e.message));
await p.addInitScript(tl => { window.TL = tl; }, TL);
await p.goto("file://" + process.cwd() + "/explainer.html");
const n = Math.round(TL.total * fps);
const from = a ? +a : 0, to = b ? +b : n, st = step ? +step : 1;
for (let i = from; i < to; i += st) {
  await p.evaluate(t => window.render(t), i / fps);
  await p.screenshot({ path: `${out}/f${String(i).padStart(5, "0")}.png` });
}
await br.close();
console.log("done", from, to);
