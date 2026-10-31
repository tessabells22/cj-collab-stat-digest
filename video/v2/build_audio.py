# Synthesizes each narration line with Festival (HTS slt voice), trims silence,
# and writes narration.wav plus timeline.json (start/end per line, word timings).
import json, subprocess, sys, os, re, wave
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
script = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "script.json")))
GAP = 0.45
def synth(i, text):
    raw, fin = f"{out}/raw{i}.wav", f"{out}/line{i}.wav"
    scm = f'{out}/l{i}.scm'
    open(scm, "w").write('(voice_cmu_us_slt_arctic_hts)\n(Parameter.set \'Duration_Stretch 1.04)\n'
        f'(utt.save.wave (utt.synth (Utterance Text "{text}")) "{raw}")\n')
    subprocess.run(["festival", "-b", scm], check=True, capture_output=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", raw, "-ar", "44100", "-ac", "1",
        "-af", "silenceremove=start_periods=1:start_threshold=-40dB,areverse,silenceremove=start_periods=1:start_threshold=-40dB,areverse,highpass=f=80,acompressor=threshold=-18dB:ratio=3,loudnorm=I=-16:TP=-1.5", fin], check=True)
    w = wave.open(fin); d = w.getnframes() / w.getframerate(); w.close()
    return fin, d
t = 0.6; tl = []; files = []
for i, s in enumerate(script):
    f, d = synth(i, s["say"])
    words = s["cap"].split()
    wts = [max(2, len(re.sub(r"\W", "", w))) + (4 if re.search(r"[.,?!]$", w) else 0) for w in words]
    tot = sum(wts); acc = 0; wl = []
    for w, k in zip(words, wts):
        wl.append({"w": w, "t0": round(t + d * acc / tot, 3), "t1": round(t + d * (acc + k) / tot, 3)}); acc += k
    tl.append({"id": s["id"], "start": round(t, 3), "end": round(t + d, 3), "words": wl})
    files.append((f, t)); t += d + GAP
total = round(t + 0.6, 2)
# mix lines at their start times
cmd = ["ffmpeg", "-loglevel", "error", "-y"]
for f, _ in files: cmd += ["-i", f]
fc = "".join(f"[{i}]adelay={int(st*1000)}:all=1[a{i}];" for i, (_, st) in enumerate(files))
fc += "".join(f"[a{i}]" for i in range(len(files))) + f"amix=inputs={len(files)}:normalize=0,apad=whole_dur={total}[o]"
cmd += ["-filter_complex", fc, "-map", "[o]", f"{out}/narration.wav"]
subprocess.run(cmd, check=True)
json.dump({"total": total, "lines": tl}, open(f"{out}/timeline.json", "w"), indent=1)
print("total", total)
for l in tl: print(l["id"], l["start"], l["end"])
