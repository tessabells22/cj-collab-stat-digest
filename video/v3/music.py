# Original background track, synthesized with numpy only (no samples).
# 100 BPM, C major, Fmaj7 - G - Em7 - Am7. Writes a stereo 44.1 kHz wav.
import numpy as np, wave, sys
out = sys.argv[1]; DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 92.0
sr = 44100; N = int(DUR * sr); rng = np.random.default_rng(7)
BPM = 100; beat = 60 / BPM; bar = 4 * beat; eighth = beat / 2
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
def put(buf, sig, t0, pan=.5, gain=1.0):
    i = int(t0 * sr)
    if i >= N: return
    s = sig[:N - i]
    buf[0, i:i + len(s)] += s * gain * np.cos(pan * np.pi / 2)
    buf[1, i:i + len(s)] += s * gain * np.sin(pan * np.pi / 2)
tone = np.zeros((2, N)); drums = np.zeros((2, N)); verb_in = np.zeros((2, N))
chords = [([53, 57, 60, 64], 41), ([55, 59, 62, 67], 43), ([52, 55, 59, 62], 40), ([57, 60, 64, 67], 45)]
chord_len = 2 * bar; ncyc = int(DUR / chord_len) + 1
def env(n, a, r):
    e = np.ones(n); na = int(a * sr); nr = int(r * sr)
    e[:na] = np.linspace(0, 1, na) ** 2; e[-nr:] = np.linspace(1, 0, nr) ** 2; return e
for c in range(ncyc * 1):
    notes, root = chords[c % 4]; t0 = c * chord_len
    n = int((chord_len + 1.4) * sr); t = np.arange(n) / sr
    # pad: detuned soft saw-ish stacks
    for m in notes:
        f = hz(m); s = 0
        for dt in (-.004, 0, .004):
            ff = f * (1 + dt); s = s + np.sin(2 * np.pi * ff * t) + .35 * np.sin(4 * np.pi * ff * t) + .12 * np.sin(6 * np.pi * ff * t)
        put(verb_in, s * env(n, 1.4, 1.4) * .035, t0, .5)
    # bass: root on 1 and 3, push on the & of 2
    for k, (off, ln) in enumerate([(0, 1.4), (2 * beat, 1.0), (3.5 * beat, .45), (4 * beat, 1.4), (6 * beat, 1.0), (7.5 * beat, .45)]):
        m = root; f = hz(m); nn = int(ln * beat * sr); tt = np.arange(nn) / sr
        s = np.sin(2 * np.pi * f * tt) + .25 * np.sin(4 * np.pi * f * tt)
        put(tone, s * np.exp(-tt * 2.2) * np.minimum(1, tt * 400) * .30, t0 + off, .5)
    # plucked arpeggio, 8ths, up an octave
    pat = [0, 1, 2, 3, 2, 1, 2, 1, 0, 1, 2, 3, 2, 3, 2, 1] if c % 2 == 0 else [3, 2, 1, 0, 1, 2, 3, 2, 3, 2, 1, 0, 1, 2, 1, 2]
    for j, idx in enumerate(pat):
        m = notes[idx] + 12; f = hz(m); nn = int(1.0 * sr); tt = np.arange(nn) / sr
        s = sum((1 / k) * np.sin(2 * np.pi * k * f * tt) * np.exp(-tt * (5 + 5 * k)) for k in range(1, 6))
        vel = .75 + .25 * (j % 2 == 0)
        t_ = t0 + j * eighth
        if t_ > 6.0 or j % 2 == 0:  # sparse intro, full after 6s
            put(verb_in, s * .20 * vel, t_, .38 + .24 * (j % 2))
    # lead-ish bell on beat 1 every other chord, an octave higher
    if c % 2 == 1:
        f = hz(notes[3] + 24); nn = int(1.8 * sr); tt = np.arange(nn) / sr
        s = np.sin(2 * np.pi * f * tt) + .4 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt * 6)
        put(verb_in, s * np.exp(-tt * 2.4) * .09, t0 + 2 * beat, .6)
# drums from 8 s, lift at 16 s, thin out in final 10 s
def kick():
    n = int(.4 * sr); t = np.arange(n) / sr; ph = 2 * np.pi * np.cumsum(46 + 90 * np.exp(-t * 30)) / sr
    return np.sin(ph) * np.exp(-t * 9)
def clap():
    n = int(.22 * sr); t = np.arange(n) / sr; x = rng.standard_normal(n); x = x - np.convolve(x, np.ones(6) / 6, "same")
    return x * np.exp(-t * 26)
def hat(open_=False):
    n = int((.16 if open_ else .05) * sr); t = np.arange(n) / sr; x = rng.standard_normal(n); x = np.diff(x, prepend=0)
    return x * np.exp(-t * (22 if open_ else 90))
K, Cl, H, HO = kick(), clap(), hat(), hat(True)
nb = int(DUR / beat)
for b in range(nb):
    t_ = b * beat
    if t_ < 8 or t_ > DUR - 9: continue
    full = t_ > 16
    if b % 4 in (0, 2) or (full and b % 8 == 7): put(drums, K, t_, .5, .55)
    if b % 4 in (1, 3) and full: put(drums, Cl, t_, .5, .20)
    for h in (0, 1):
        tt = t_ + h * eighth; put(drums, HO if (h and b % 4 == 3) else H, tt, .62 if h else .4, (.07 if h else .045) * (1 if full else .6))
# reverb on the tonal bus
irn = int(1.9 * sr); ir = rng.standard_normal((2, irn)) * np.exp(-np.arange(irn) / sr * 2.6); ir[:, :int(.02 * sr)] *= np.linspace(0, 1, int(.02 * sr))
wet = np.stack([np.fft.irfft(np.fft.rfft(verb_in[ch], N + irn) * np.fft.rfft(ir[ch], N + irn), N + irn)[:N] for ch in (0, 1)]) * .045
# ping-pong echo on the dry plucks bus
def delay(x, dt, fb, n=3):
    y = x.copy()
    for k in range(1, n + 1):
        d = int(dt * sr * k); y[:, d:] += (x[:, :N - d] * fb ** k)[::-1 if False else 1]
    return y
mix = tone + drums + verb_in * .85 + wet
mix = delay(mix, .45, .22, 2) * .5 + mix * .5
# gentle glue: soft clip, then normalise
mix = np.tanh(mix * 1.4) / 1.4
fi = int(2.0 * sr); fo = int(5.0 * sr); mix[:, :fi] *= np.linspace(0, 1, fi); mix[:, -fo:] *= np.linspace(1, 0, fo)
mix *= .89 / np.abs(mix).max()
pcm = (mix.T * 32767).astype("<i2")
w = wave.open(out, "wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes()); w.close()
print("ok", DUR, "rms dBFS", 20 * np.log10(np.sqrt((mix ** 2).mean())))
