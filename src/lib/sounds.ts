// Web Audio API sound effects - no external files needed
const audioCtx = () => {
  if (!(window as any).__audioCtx) {
    (window as any).__audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return (window as any).__audioCtx as AudioContext;
};

let soundEnabled = localStorage.getItem('xplay-sound') !== 'false';

export const isSoundEnabled = () => soundEnabled;
export const toggleSound = () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem('xplay-sound', String(soundEnabled));
  return soundEnabled;
};

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  if (!soundEnabled) return;
  try {
    const ctx = audioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

function playChord(freqs: number[], duration: number, type: OscillatorType = 'sine', volume = 0.08) {
  freqs.forEach((f, i) => setTimeout(() => playTone(f, duration, type, volume), i * 60));
}

// === Sound effects ===

export const sounds = {
  // UI
  click: () => playTone(800, 0.08, 'square', 0.06),
  hover: () => playTone(1200, 0.04, 'sine', 0.03),
  navigate: () => playTone(600, 0.12, 'triangle', 0.08),
  
  // Game actions
  move: () => playTone(440, 0.1, 'triangle', 0.1),
  capture: () => { playTone(300, 0.15, 'sawtooth', 0.08); playTone(200, 0.2, 'sawtooth', 0.06); },
  check: () => { playTone(880, 0.1, 'square', 0.1); setTimeout(() => playTone(660, 0.15, 'square', 0.1), 100); },
  invalid: () => playTone(200, 0.2, 'sawtooth', 0.12),
  
  // Results
  win: () => playChord([523, 659, 784, 1047], 0.4, 'triangle', 0.12),
  lose: () => { playTone(300, 0.3, 'sawtooth', 0.08); setTimeout(() => playTone(200, 0.4, 'sawtooth', 0.06), 200); },
  draw: () => playChord([440, 554], 0.3, 'triangle', 0.08),
  
  // Rewards
  coinEarn: () => { playTone(1047, 0.08, 'square', 0.06); setTimeout(() => playTone(1319, 0.12, 'square', 0.08), 80); },
  achievement: () => playChord([523, 659, 784, 1047, 1319], 0.5, 'sine', 0.1),
  levelUp: () => { playChord([262, 330, 392], 0.3, 'triangle', 0.1); setTimeout(() => playChord([392, 494, 587], 0.4, 'triangle', 0.1), 300); },
  
  // Social
  message: () => playTone(880, 0.06, 'sine', 0.05),
  notification: () => { playTone(660, 0.1, 'sine', 0.08); setTimeout(() => playTone(880, 0.15, 'sine', 0.08), 120); },
  
  // Special
  bonus: () => playChord([784, 988, 1175, 1568], 0.6, 'sine', 0.12),
  dice: () => { for (let i = 0; i < 5; i++) setTimeout(() => playTone(300 + Math.random() * 400, 0.05, 'square', 0.04), i * 40); },
  countdown: () => playTone(440, 0.15, 'square', 0.08),
};
