# Takes per-line narration wavs (raw{i}.wav), trims and levels them, aligns words to the audio,
# mixes narration over the music with ducking, and writes timeline.json.
# usage: python3 build_audio.py <rawDir> <music.wav> <outDir>
import json, subprocess, sys, os, re, wave
raw, music, out = sys.argv[1:4]; os.makedirs(out, exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))
script = json.load(open(os.path.join(here, "script.json")))
GAP, LEAD = 0.5, 0.7
def run(*a): return subprocess.run(a, check=True, capture_output=True, text=True)
def dur(f):
    w = wave.open(f); d = w.getnframes() / w.getframerate(); w.close(); return d
def prep(i):
    src, dst = f"{raw}/raw{i}.wav", f"{out}/line{i}.wav"
    trim = "silenceremove=start_periods=1:start_threshold=-42dB,areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse"
    run("ffmpeg", "-loglevel", "error", "-y", "-i", src, "-ar", "44100", "-ac", "1", "-af",
        f"{trim},highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120,loudnorm=I=-16:TP=-1.5", dst)
    return dst, dur(dst)
def segments(f, d):
    r = run("ffmpeg", "-hide_banner", "-i", f, "-af", "silencedetect=n=-34dB:d=0.13", "-f", "null", "-")
    st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    segs, cur = [], 0.0
    for s, e in zip(st, en + [None] * (len(st) - len(en))):
        if s > cur + .05: segs.append([cur, s])
        cur = e if e is not None else d
    if cur < d - .05: segs.append([cur, d])
    return segs
def align(words, t0, d, f):
    ws = words
    phr, cur = [], []
    for w in ws:
        cur.append(w)
        if re.search(r"[.?!,]$", w): phr.append(cur); cur = []
    if cur: phr.append(cur)
    segs = segments(f, d)
    while len(segs) > len(phr) and len(segs) > 1:  # merge the smallest gap
        g = min(range(len(segs) - 1), key=lambda k: segs[k + 1][0] - segs[k][1]); segs[g][1] = segs[g + 1][1]; del segs[g + 1]
    if len(segs) != len(phr): segs = [[0, d]]; phr = [ws]
    res = []
    for ph, (a, b) in zip(phr, segs):
        wt = [max(2, len(re.sub(r"\W", "", w))) for w in ph]; tot = sum(wt); acc = 0
        for w, k in zip(ph, wt):
            res.append({"w": w, "t0": round(t0 + a + (b - a) * acc / tot, 3), "t1": round(t0 + a + (b - a) * (acc + k) / tot, 3)}); acc += k
    return res
t = LEAD; tl = []; files = []
for i, s in enumerate(script):
    f, d = prep(i)
    tl.append({"id": s["id"], "start": round(t, 3), "end": round(t + d, 3), "words": align(s["cap"].split(), t, d, f)})
    files.append((f, t)); t += d + GAP
total = round(t + 1.2, 2)
cmd = ["ffmpeg", "-loglevel", "error", "-y"]
for f, _ in files: cmd += ["-i", f]
fc = "".join(f"[{i}]adelay={int(st*1000)}:all=1[a{i}];" for i, (_, st) in enumerate(files))
fc += "".join(f"[a{i}]" for i in range(len(files))) + f"amix=inputs={len(files)}:normalize=0,apad=whole_dur={total}[o]"
run(*cmd, "-filter_complex", fc, "-map", "[o]", "-ar", "44100", f"{out}/narration.wav")
# music under the voice: sidechain-ducked, fades out at the end
run("ffmpeg", "-loglevel", "error", "-y", "-i", f"{out}/narration.wav", "-i", music, "-filter_complex",
    f"[1]atrim=0:{total},volume=0.42,afade=t=out:st={total-4}:d=4,aformat=channel_layouts=stereo[m];"
    f"[0]asplit=2[v][k];[m][k]sidechaincompress=threshold=0.02:ratio=7:attack=25:release=450:makeup=1[d];"
    f"[v]aformat=channel_layouts=stereo[vs];[vs][d]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[o]",
    "-map", "[o]", "-t", str(total), f"{out}/final_audio.wav")
json.dump({"total": total, "lines": tl}, open(f"{out}/timeline.json", "w"), indent=1)
print("total", total)
for l in tl: print(l["id"], l["start"], l["end"])
