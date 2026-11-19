import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';

interface TranscriptTurn {
  id: string;
  speaker: 'Tú' | 'Asesor de Voz';
  text: string;
}

function floatTo16BitPcmBase64(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const length = bytes.byteLength / 2;
  const float32 = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

export const VoiceLivePanel: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const statusRef = useRef<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>(
    'Presiona el botón grande para hablar en tiempo real con tu asesor financiero.'
  );
  const [transcripts, setTranscripts] = useState<TranscriptTurn[]>([]);

  const updateStatus = (next: 'idle' | 'connecting' | 'live' | 'error') => {
    statusRef.current = next;
    setStatus(next);
  };

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const stopAll = () => {
    try {
      processorRef.current?.disconnect();
    } catch {
      // ignore
    }
    processorRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // ignore
      }
    });
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;

    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
      wsRef.current.close();
    }
    wsRef.current = null;

    inputCtxRef.current?.close().catch(() => {});
    inputCtxRef.current = null;
    outputCtxRef.current?.close().catch(() => {});
    outputCtxRef.current = null;

    updateStatus('idle');
    setStatusMessage('Sesión de voz finalizada. Puedes iniciarla de nuevo cuando quieras.');
  };

  useEffect(() => {
    return () => {
      stopAll();
    };
  }, []);

  const schedulePlayback = (base64Pcm: string) => {
    const outCtx = outputCtxRef.current;
    if (!outCtx) return;
    const floatData = base64PcmToFloat32(base64Pcm);
    const buffer = outCtx.createBuffer(1, floatData.length, 24000);
    buffer.getChannelData(0).set(floatData);

    const source = outCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(outCtx.destination);

    const now = outCtx.currentTime;
    const startAt = Math.max(now, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;
    activeSourcesRef.current.push(source);

    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
    };
  };

  const clearAudioQueue = () => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // ignore
      }
    });
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;
  };

  const startLiveVoice = async () => {
    if (status === 'connecting' || status === 'live') {
      stopAll();
      return;
    }

    updateStatus('connecting');
    setStatusMessage('Conectando micrófono y voz en vivo (gemini-3.8-live)...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const samples = e.inputBuffer.getChannelData(0);
          const base64 = floatTo16BitPcmBase64(samples);
          ws.send(JSON.stringify({ audio: base64 }));
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.ready) {
            updateStatus('live');
            setStatusMessage('Escuchando en vivo: habla normalmente y el asesor te responderá por voz.');
          }
          if (msg.error) {
            stopAll();
            updateStatus('error');
            setStatusMessage(msg.error);
          }
          if (msg.audio) {
            schedulePlayback(msg.audio);
          }
          if (msg.interrupted) {
            clearAudioQueue();
          }
          if (msg.inputTranscript) {
            setTranscripts((prev) => [
              ...prev,
              { id: `u-${Date.now()}`, speaker: 'Tú', text: msg.inputTranscript },
            ]);
          }
          if (msg.outputTranscript) {
            setTranscripts((prev) => [
              ...prev,
              { id: `a-${Date.now()}`, speaker: 'Asesor de Voz', text: msg.outputTranscript },
            ]);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        updateStatus('error');
        setStatusMessage('No se pudo conectar la sesión de audio en vivo.');
      };

      ws.onclose = () => {
        if (statusRef.current === 'live') {
          stopAll();
        }
      };
    } catch {
      stopAll();
      updateStatus('error');
      setStatusMessage(
        'No fue posible acceder al micrófono. Verifica los permisos de audio en tu navegador.'
      );
    }
  };

  return (
    <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-indigo-400" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Asesor Financiero por Voz en Vivo (gemini-3.8-live)
            </h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Ideal si prefieres escuchar explicaciones paso a paso sin tener que leer textos pequeños.
          </p>
        </div>

        <button
          onClick={startLiveVoice}
          className={`inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl text-sm sm:text-base font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            status === 'live' || status === 'connecting'
              ? 'bg-rose-600 hover:bg-rose-700 text-white'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}
          aria-pressed={status === 'live'}
        >
          {status === 'live' || status === 'connecting' ? (
            <>
              <MicOff className="w-5 h-5" />
              Terminar Llamada de Voz
            </>
          ) : (
            <>
              <Mic className="w-5 h-5" />
              Hablar con el Asesor
            </>
          )}
        </button>
      </div>

      <div
        className={`p-4 rounded-xl border text-sm font-medium ${
          status === 'live'
            ? 'bg-emerald-950/30 border-emerald-700 text-emerald-200'
            : status === 'error'
            ? 'bg-rose-950/30 border-rose-700 text-rose-200'
            : 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
        }`}
        aria-live="polite"
      >
        {statusMessage}
      </div>

      {transcripts.length > 0 && (
        <div className="space-y-2 max-h-56 overflow-y-auto p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          {transcripts.map((t) => (
            <div key={t.id} className="text-sm">
              <strong
                className={
                  t.speaker === 'Tú'
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }
              >
                {t.speaker}:{' '}
              </strong>
              <span className="text-slate-800 dark:text-slate-200">{t.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
