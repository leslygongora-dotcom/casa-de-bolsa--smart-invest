import { AlarmToneKind, TonePreset } from '../types';

export const TONE_PRESET_OPTIONS: {
  value: TonePreset;
  label: string;
  description: string;
  priorityGroup: 'alta_prioridad' | 'informativa';
}[] = [
  {
    value: 'sirena_urgente',
    label: 'Sirena Descendente Urgente',
    description: 'Doble secuencia rápida aguda-grave de alerta máxima para venta inmediata',
    priorityGroup: 'alta_prioridad',
  },
  {
    value: 'pulso_alerta',
    label: 'Triple Pulso de Precaución',
    description: 'Tres pitidos cortos de alta frecuencia para Stop Loss',
    priorityGroup: 'alta_prioridad',
  },
  {
    value: 'alarma_institucional',
    label: 'Alarma Bitonal Ejecutiva',
    description: 'Doble señal incisiva de escritorio bursátil para alertas críticas',
    priorityGroup: 'alta_prioridad',
  },
  {
    value: 'campana_ascendente',
    label: 'Arpegio Ascendente (Oportunidad)',
    description: 'Cuatro notas ascendentes claras indicando señal de entrada',
    priorityGroup: 'alta_prioridad',
  },
  {
    value: 'timbre_suave',
    label: 'Timbre Suave (En Ganancia)',
    description: 'Tono cálido pausado para avisos de retroceso sin pérdida',
    priorityGroup: 'informativa',
  },
  {
    value: 'pulso_discreto',
    label: 'Pulso Discreto de Custodia',
    description: 'Dos notas tenues no intrusivas para noticias y confirmaciones de mantener',
    priorityGroup: 'informativa',
  },
  {
    value: 'acorde_ganancia',
    label: 'Acorde Brillante (Meta)',
    description: 'Notas armónicas altas para notificaciones de objetivos cumplidos',
    priorityGroup: 'informativa',
  },
];

interface ToneStep {
  freq: number;
  start: number;
  dur: number;
  wave: OscillatorType;
  vol: number;
}

function getStepsForPreset(preset: TonePreset): ToneStep[] {
  switch (preset) {
    case 'sirena_urgente':
      return [
        { freq: 987.77, start: 0.0, dur: 0.12, wave: 'sawtooth', vol: 0.11 },
        { freq: 622.25, start: 0.13, dur: 0.14, wave: 'sawtooth', vol: 0.11 },
        { freq: 987.77, start: 0.3, dur: 0.12, wave: 'sawtooth', vol: 0.12 },
        { freq: 523.25, start: 0.43, dur: 0.18, wave: 'sawtooth', vol: 0.11 },
      ];
    case 'pulso_alerta':
      return [
        { freq: 880, start: 0.0, dur: 0.11, wave: 'triangle', vol: 0.16 },
        { freq: 880, start: 0.16, dur: 0.11, wave: 'triangle', vol: 0.16 },
        { freq: 740, start: 0.32, dur: 0.2, wave: 'triangle', vol: 0.16 },
      ];
    case 'alarma_institucional':
      return [
        { freq: 1046.5, start: 0.0, dur: 0.1, wave: 'square', vol: 0.08 },
        { freq: 783.99, start: 0.12, dur: 0.1, wave: 'square', vol: 0.08 },
        { freq: 1046.5, start: 0.25, dur: 0.1, wave: 'square', vol: 0.09 },
        { freq: 783.99, start: 0.37, dur: 0.16, wave: 'square', vol: 0.08 },
      ];
    case 'campana_ascendente':
      return [
        { freq: 523.25, start: 0.0, dur: 0.11, wave: 'triangle', vol: 0.14 },
        { freq: 659.25, start: 0.11, dur: 0.11, wave: 'triangle', vol: 0.14 },
        { freq: 783.99, start: 0.22, dur: 0.11, wave: 'triangle', vol: 0.15 },
        { freq: 1046.5, start: 0.33, dur: 0.22, wave: 'sine', vol: 0.16 },
      ];
    case 'timbre_suave':
      return [
        { freq: 440.0, start: 0.0, dur: 0.18, wave: 'sine', vol: 0.12 },
        { freq: 523.25, start: 0.2, dur: 0.22, wave: 'sine', vol: 0.12 },
        { freq: 493.88, start: 0.44, dur: 0.26, wave: 'sine', vol: 0.1 },
      ];
    case 'pulso_discreto':
      return [
        { freq: 587.33, start: 0.0, dur: 0.13, wave: 'sine', vol: 0.08 },
        { freq: 659.25, start: 0.16, dur: 0.2, wave: 'sine', vol: 0.08 },
      ];
    case 'acorde_ganancia':
      return [
        { freq: 659.25, start: 0.0, dur: 0.14, wave: 'sine', vol: 0.14 },
        { freq: 987.77, start: 0.14, dur: 0.14, wave: 'sine', vol: 0.14 },
        { freq: 1318.51, start: 0.28, dur: 0.26, wave: 'sine', vol: 0.15 },
      ];
  }
}

export function playTonePreset(preset: TonePreset) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const steps = getStepsForPreset(preset);

    steps.forEach((step) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = step.wave;
      osc.frequency.setValueAtTime(step.freq, now + step.start);
      gain.gain.setValueAtTime(0.001, now + step.start);
      gain.gain.exponentialRampToValueAtTime(step.vol, now + step.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + step.start + step.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + step.start);
      osc.stop(now + step.start + step.dur + 0.02);
    });
  } catch {
    // Ignore audio context autoplay errors silently
  }
}

export async function playCustomAudioDataUrl(dataUrl: string): Promise<boolean> {
  try {
    const audio = new Audio(dataUrl);
    audio.volume = 0.85;
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

export function playAlarmSound(
  type: AlarmToneKind | 'sell' | 'hold',
  customPreset?: TonePreset,
  customClipDataUrl?: string | null
) {
  if (customClipDataUrl) {
    playCustomAudioDataUrl(customClipDataUrl).then((played) => {
      if (!played && customPreset) {
        playTonePreset(customPreset);
      }
    });
    return;
  }

  if (customPreset) {
    playTonePreset(customPreset);
    return;
  }

  switch (type) {
    case 'urgent_sell_loss':
    case 'sell':
      playTonePreset('sirena_urgente');
      break;
    case 'buy_opportunity':
      playTonePreset('campana_ascendente');
      break;
    case 'dip_in_profit':
      playTonePreset('timbre_suave');
      break;
    case 'sell_profit':
      playTonePreset('acorde_ganancia');
      break;
    case 'hold_steady':
    case 'hold':
    default:
      playTonePreset('pulso_discreto');
      break;
  }
}

export function triggerMobileVibration(urgent: boolean) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(urgent ? [220, 100, 220, 100, 300] : [140, 80, 140]);
    } catch {
      // Ignore unsupported vibration calls
    }
  }
}

export async function requestBrowserNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function sendBrowserPushNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        tag: `smart-invest-${Date.now()}`,
      });
    } catch {
      // Ignore notification errors inside sandboxed iframes
    }
  }
}
