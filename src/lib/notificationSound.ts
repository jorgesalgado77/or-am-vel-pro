const BEEP_DURATION = 150;
const STORAGE_KEY = "notification_sound_enabled";
const VOLUME_KEY = "notification_sound_volume";
const DEFAULT_VOLUME = 0.3;

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

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

function playBeep(frequency: number, duration: number, volume: number, count = 1) {
  try {
    const ctx = getCtx();
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = frequency;
      osc.type = "sine";
      const startTime = ctx.currentTime + i * (duration / 1000 + 0.08);
      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration / 1000);
      osc.start(startTime);
      osc.stop(startTime + duration / 1000);
    }
  } catch {
    // Silent fail
  }
}

/** Default notification beep */
export function playNotificationSound() {
  if (!isNotificationSoundEnabled()) return;
  const volume = getNotificationVolume();
  if (volume <= 0) return;
  playBeep(830, BEEP_DURATION, volume);
}

/** 🔥 Lead quente: triple rapid high-pitch beep (urgent) */
export function playHotLeadSound() {
  if (!isNotificationSoundEnabled()) return;
  const volume = getNotificationVolume();
  if (volume <= 0) return;
  playBeep(1200, 100, volume, 3);
}

/** 🟡 Lead morno: double medium-pitch beep */
export function playWarmLeadSound() {
  if (!isNotificationSoundEnabled()) return;
  const volume = getNotificationVolume();
  if (volume <= 0) return;
  playBeep(880, 120, volume, 2);
}

/** ❄️ Lead frio: single low-pitch beep (subtle) */
export function playColdLeadSound() {
  if (!isNotificationSoundEnabled()) return;
  const volume = getNotificationVolume();
  if (volume <= 0) return;
  playBeep(520, 200, Math.max(volume * 0.6, 0.05));
}

/** Play sound based on lead temperature */
export function playLeadNotificationSound(temperature?: string | null) {
  switch (temperature) {
    case "quente":
      return playHotLeadSound();
    case "morno":
      return playWarmLeadSound();
    case "frio":
      return playColdLeadSound();
    default:
      return playNotificationSound();
  }
}
