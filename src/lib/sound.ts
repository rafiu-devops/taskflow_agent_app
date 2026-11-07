type Kind = "send" | "receive" | "error";
const KEY = "taskflow:sound";
let ctx: AudioContext | null = null;

export const isSoundOn = () =>
  typeof window !== "undefined" && window.localStorage.getItem(KEY) !== "off";
export const setSoundOn = (on: boolean) =>
  window.localStorage.setItem(KEY, on ? "on" : "off");

export function unlockAudio() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* audio unsupported */
  }
}

function tone(freq: number, at: number, dur: number, peak: number, type: OscillatorType = "sine") {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

export function playSound(kind: Kind) {
  if (!isSoundOn() || !ctx || ctx.state !== "running") return;
  if (document.visibilityState !== "visible" && kind === "receive") return;
  if (kind === "send") {
    tone(660, 0, 0.09, 0.05);
    tone(880, 0.06, 0.12, 0.045);
  } else if (kind === "receive") {
    tone(523.25, 0, 0.14, 0.05);
    tone(783.99, 0.1, 0.26, 0.04);
  } else {
    tone(246.94, 0, 0.18, 0.05, "triangle");
    tone(196, 0.12, 0.22, 0.04, "triangle");
  }
  if (kind !== "error" && "vibrate" in navigator) navigator.vibrate?.(8);
}