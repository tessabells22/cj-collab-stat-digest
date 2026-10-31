// Narration with Kokoro-82M (Apache-2.0) via onnxruntime-node.
// usage (from a folder with onnxruntime-node + phonemizer installed and phonemize.mjs next to it):
//   node tts.mjs <modelDir> <script.json> <outDir> [voice] [speed]
// modelDir holds kokoro-quantized.onnx, tokenizer.json, voices/*.bin (all shipped in the npm package expo-kokoro).
import fs from "fs"; import path from "path"; import { createRequire } from "module";
const require = createRequire(path.join(process.cwd(), "package.json"));
const ort = require("onnxruntime-node");
const { phonemize } = await import(path.join(process.cwd(), "phonemize.mjs"));
const [modelDir, scriptPath, outDir, voice = "af_heart", speed = "1"] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const vocab = JSON.parse(fs.readFileSync(path.join(modelDir, "tokenizer.json"), "utf8")).model.vocab;
const sess = await ort.InferenceSession.create(path.join(modelDir, "kokoro-quantized.onnx"));
const vb = fs.readFileSync(path.join(modelDir, "voices", voice + ".bin"));
const vdata = new Float32Array(vb.buffer, vb.byteOffset, vb.byteLength / 4);
function wav(f32, sr) {
  const n = f32.length, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767))), 44 + i * 2);
  return b;
}
const lines = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
for (let i = 0; i < lines.length; i++) {
  const ph = await phonemize(lines[i].say, "a");
  const ids = [0, ...[...ph].map(c => vocab[c]).filter(v => v !== undefined), 0];
  const nt = Math.min(Math.max(ids.length - 2, 0), 509);
  const style = vdata.slice(nt * 256, nt * 256 + 256);
  const out = await sess.run({
    input_ids: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    style: new ort.Tensor("float32", style, [1, 256]),
    speed: new ort.Tensor("float32", Float32Array.from([+speed]), [1]),
  });
  const w = out.waveform.data;
  fs.writeFileSync(path.join(outDir, `raw${i}.wav`), wav(w, 24000));
  console.log(i, lines[i].id, (w.length / 24000).toFixed(2) + "s", ph.slice(0, 70));
}
