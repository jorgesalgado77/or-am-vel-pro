const BEEP_FREQUENCY = 830;
const BEEP_DURATION = 150;
const STORAGE_KEY = "notification_sound_enabled";
const VOLUME_KEY = "notification_sound_volume";
const DEFAULT_VOLUME = 0.3;

let audioCtx: AudioContext | null = null;

export function isNotificationSoundEnabled(): boolean {
  const val = localStorage.getItem(STORAGE_KEY);
  return val === null ? true : val === "true";
}

export function setNotificationSoundEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

export function getNotificationVolume(): number {
  const val = localStorage.getItem(VOLUME_KEY);
  return val === null ? DEFAULT_VOLUME : Number(val);
}

export function setNotificationVolume(volume: number) {
  localStorage.setItem(VOLUME_KEY, String(Math.max(0, Math.min(1, volume))));
}

export function playNotificationSound() {
  if (!isNotificationSoundEnabled()) return;
  const volume = getNotificationVolume();
  if (volume <= 0) return;
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
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + BEEP_DURATION / 1000);
    osc.start();
    osc.stop(audioCtx.currentTime + BEEP_DURATION / 1000);
  } catch {
    // Silent fail if audio not supported
  }
}
