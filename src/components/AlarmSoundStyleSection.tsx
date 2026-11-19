import React, { useState } from 'react';
import { Bell, Music, ShieldAlert, Trash2, Upload, Volume2 } from 'lucide-react';
import { CustomAudioClip, TonePreset } from '../types';
import {
  playCustomAudioDataUrl,
  playTonePreset,
  TONE_PRESET_OPTIONS,
} from '../utils/audioAlarm';

interface AlarmSoundStyleSectionProps {
  highPriorityTone: TonePreset;
  informativeTone: TonePreset;
  customHighPriority: CustomAudioClip | null;
  customInformative: CustomAudioClip | null;
  onChangeHighPriorityTone: (tone: TonePreset) => void;
  onChangeInformativeTone: (tone: TonePreset) => void;
  onChangeCustomHighPriority: (clip: CustomAudioClip | null) => void;
  onChangeCustomInformative: (clip: CustomAudioClip | null) => void;
  onNotifyToast?: (msg: string, tone?: 'success' | 'warning' | 'info') => void;
}

const MAX_AUDIO_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

export const AlarmSoundStyleSection: React.FC<AlarmSoundStyleSectionProps> = ({
  highPriorityTone,
  informativeTone,
  customHighPriority,
  customInformative,
  onChangeHighPriorityTone,
  onChangeInformativeTone,
  onChangeCustomHighPriority,
  onChangeCustomInformative,
  onNotifyToast,
}) => {
  const [uploadError, setUploadError] = useState<string | null>(null);

  const highPriorityOptions = TONE_PRESET_OPTIONS.filter(
    (o) => o.priorityGroup === 'alta_prioridad'
  );
  const informativeOptions = TONE_PRESET_OPTIONS.filter(
    (o) => o.priorityGroup === 'informativa'
  );

  const handleFileUpload = (
    file: File | undefined,
    tier: 'high' | 'informative'
  ) => {
    setUploadError(null);
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      const err = 'Selecciona un archivo de audio válido (.mp3, .wav, .ogg o .m4a).';
      setUploadError(err);
      onNotifyToast?.(err, 'warning');
      return;
    }

    if (file.size > MAX_AUDIO_SIZE_BYTES) {
      const err = 'El archivo de audio supera el límite de 1.5 MB.';
      setUploadError(err);
      onNotifyToast?.(err, 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const clip: CustomAudioClip = {
        name: file.name,
        dataUrl: reader.result,
        mimeType: file.type,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
      };
      if (tier === 'high') {
        onChangeCustomHighPriority(clip);
        onNotifyToast?.(
          `Audio de alta prioridad cargado: ${clip.name}`,
          'success'
        );
      } else {
        onChangeCustomInformative(clip);
        onNotifyToast?.(
          `Audio para notificaciones informativas cargado: ${clip.name}`,
          'success'
        );
      }
      playCustomAudioDataUrl(clip.dataUrl);
    };
    reader.onerror = () => {
      const err = 'No se pudo leer el archivo de audio seleccionado.';
      setUploadError(err);
      onNotifyToast?.(err, 'warning');
    };
    reader.readAsDataURL(file);
  };

  const previewTierSound = (tier: 'high' | 'informative') => {
    if (tier === 'high') {
      if (customHighPriority?.dataUrl) {
        playCustomAudioDataUrl(customHighPriority.dataUrl).then((ok) => {
          if (!ok) playTonePreset(highPriorityTone);
        });
      } else {
        playTonePreset(highPriorityTone);
      }
    } else {
      if (customInformative?.dataUrl) {
        playCustomAudioDataUrl(customInformative.dataUrl).then((ok) => {
          if (!ok) playTonePreset(informativeTone);
        });
      } else {
        playTonePreset(informativeTone);
      }
    }
  };

  const highDesc =
    TONE_PRESET_OPTIONS.find((o) => o.value === highPriorityTone)?.description || '';
  const infoDesc =
    TONE_PRESET_OPTIONS.find((o) => o.value === informativeTone)?.description || '';

  return (
    <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-800/90">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Music className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Estilos de Sonido para Notificaciones Push</span>
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            Selecciona un estilo predefinido o sube tu propio archivo de audio (.mp3, .wav, .m4a) diferenciando alertas críticas de notificaciones informativas.
          </p>
        </div>
      </div>

      {uploadError && (
        <div
          role="alert"
          className="p-2.5 rounded-md border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs font-medium text-rose-700 dark:text-rose-300"
        >
          {uploadError}
        </div>
      )}

      {/* NIVEL 1: ALERTAS DE ALTA PRIORIDAD (VENTA URGENTE) */}
      <div className="p-4 rounded-md bg-slate-50 dark:bg-[#090C11] border border-rose-200 dark:border-rose-900/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
            <div>
              <div className="text-xs sm:text-sm font-bold text-rose-700 dark:text-rose-400">
                Alta Prioridad · Venta Urgente y Stop Loss
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Sonido de atención inmediata cuando una posición rompe tu umbral de pérdida
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => previewTierSound('high')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
          >
            <Volume2 className="w-3.5 h-3.5" />
            Probar Alta Prioridad
          </button>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Estilo de sonido integrado
          </label>
          <select
            value={highPriorityTone}
            onChange={(e) => onChangeHighPriorityTone(e.target.value as TonePreset)}
            className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-xs sm:text-sm font-semibold text-slate-900 dark:text-white"
          >
            <optgroup label="Recomendados para Alta Prioridad">
              {highPriorityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Otros Estilos Disponibles">
              {informativeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{highDesc}</p>
        </div>

        {/* Subir audio personalizado para Alta Prioridad */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {customHighPriority ? (
            <>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  Audio propio activo: {customHighPriority.name}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {customHighPriority.sizeKb} KB · Reemplaza al tono integrado en alertas urgentes
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => playCustomAudioDataUrl(customHighPriority.dataUrl)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" /> Escuchar
                </button>
                <button
                  type="button"
                  onClick={() => onChangeCustomHighPriority(null)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-rose-300 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Quitar
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                O sube un archivo propio para Venta Urgente (máx. 1.5 MB)
              </span>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-rose-500 cursor-pointer shrink-0">
                <Upload className="w-3.5 h-3.5" />
                <span>Subir Audio Urgente</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="sr-only"
                  onChange={(e) => {
                    handleFileUpload(e.target.files?.[0], 'high');
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            </>
          )}
        </div>
      </div>

      {/* NIVEL 2: NOTIFICACIONES INFORMATIVAS */}
      <div className="p-4 rounded-md bg-slate-50 dark:bg-[#090C11] border border-emerald-200 dark:border-emerald-900/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-500 shrink-0" />
            <div>
              <div className="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-400">
                Notificaciones Informativas · Seguimiento y Mantener
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Sonido discreto y calmado para avisos de mantener posición, noticias y retrocesos en ganancia
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => previewTierSound('informative')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
          >
            <Volume2 className="w-3.5 h-3.5" />
            Probar Informativa
          </button>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Estilo de sonido integrado
          </label>
          <select
            value={informativeTone}
            onChange={(e) => onChangeInformativeTone(e.target.value as TonePreset)}
            className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-xs sm:text-sm font-semibold text-slate-900 dark:text-white"
          >
            <optgroup label="Recomendados para Notificaciones Informativas">
              {informativeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Otros Estilos Disponibles">
              {highPriorityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{infoDesc}</p>
        </div>

        {/* Subir audio personalizado para Notificaciones Informativas */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {customInformative ? (
            <>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  Audio propio activo: {customInformative.name}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {customInformative.sizeKb} KB · Reemplaza al tono integrado en notificaciones informativas
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => playCustomAudioDataUrl(customInformative.dataUrl)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" /> Escuchar
                </button>
                <button
                  type="button"
                  onClick={() => onChangeCustomInformative(null)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-rose-300 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Quitar
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                O sube un archivo propio para avisos informativos (máx. 1.5 MB)
              </span>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131B] text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-emerald-500 cursor-pointer shrink-0">
                <Upload className="w-3.5 h-3.5" />
                <span>Subir Audio Informativo</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="sr-only"
                  onChange={(e) => {
                    handleFileUpload(e.target.files?.[0], 'informative');
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
