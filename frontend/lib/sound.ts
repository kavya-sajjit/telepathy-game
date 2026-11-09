// Tiny square-wave bleeps. No audio files, nothing to load.
let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = typeof window !== "undefined" && localStorage.getItem("telepathy:muted") === "1";
} catch {}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("telepathy:muted", m ? "1" : "0");
  } catch {}
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "square", vol = 0.05) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

const SONGS: Record<string, [number, number, number][]> = {
  lock: [[660, 0, 0.07], [990, 0.07, 0.09]],
  join: [[523, 0, 0.08], [784, 0.08, 0.1]],
  meld: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.25]],
  partial: [[523, 0, 0.1], [659, 0.12, 0.18]],
  static: [[220, 0, 0.12], [165, 0.13, 0.22]],
  tick: [[880, 0, 0.03]],
};

export function play(name: keyof typeof SONGS) {
  if (muted || typeof window === "undefined") return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    for (const [f, s, d] of SONGS[name]) tone(f, s, d, name === "static" ? "sawtooth" : "square");
  } catch {}
}
