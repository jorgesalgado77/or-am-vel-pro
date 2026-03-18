const BEEP_FREQUENCY = 830;
const BEEP_DURATION = 150;
const BEEP_VOLUME = 0.3;

let audioCtx: AudioContext | null = null;

export function playNotificationSound() {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = BEEP_FREQUENCY;
    osc.type = "sine";
    gain.gain.setValueAtTime(BEEP_VOLUME, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + BEEP_DURATION / 1000);
    osc.start();
    osc.stop(audioCtx.currentTime + BEEP_DURATION / 1000);
  } catch {
    // Silent fail if audio not supported
  }
}
