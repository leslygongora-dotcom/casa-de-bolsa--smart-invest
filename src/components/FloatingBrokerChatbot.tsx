import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, MessageSquare, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { PortfolioPosition, Sector, TabId } from '../types';

interface GroundingSource {
  title: string;
  uri: string;
}

interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  sources?: GroundingSource[];
}

interface FloatingBrokerChatbotProps {
  activeTab: TabId;
  selectedSymbol: string;
  positions: PortfolioPosition[];
  favoriteSectors: { sector: Sector; score: number }[];
  portfolioVarPct: number;
}

export const FloatingBrokerChatbot: React.FC<FloatingBrokerChatbotProps> = ({
  activeTab,
  selectedSymbol,
  positions,
  favoriteSectors,
  portfolioVarPct,
}) => {
  const [open, setOpen] = useState(false);
  const mode = 'fast' as const;
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      id: 'bot-welcome',
      role: 'model',
      text: '¡Hola! Soy tu Asistente Gemini Flash-Lite de Smart Invest. Pregúntame sobre tus acciones, opciones Call/Put, comisiones de 0.10% o riesgo VaR.',
      modelUsed: 'gemini-3.1-flash-lite',
    },
  ]);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, open]);

  const handleSend = async (textToSend: string) => {
    const q = textToSend.trim();
    if (!q || loading) return;

    const userTurn: ChatTurn = { id: `u-${Date.now()}`, role: 'user', text: q };
    const snapshot = [...messages];
    setMessages((prev) => [...prev, userTurn]);
    setInput('');
    setLoading(true);

    try {
      const contextStr = `Vista actual: ${activeTab}. Acción seleccionada: ${selectedSymbol}. Posiciones en cartera: ${
        positions.map((p) => `${p.symbol} (${p.shares} títulos)`).join(', ') || 'ninguna'
      }. VaR actual: ${portfolioVarPct.toFixed(2)}%. Sectores favoritos: ${favoriteSectors
        .slice(0, 2)
        .map((s) => s.sector)
        .join(', ')}.`;

      const res = await fetch('/api/chat/multi-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: snapshot.map((m) => ({ role: m.role, text: m.text })),
          message: q,
          mode,
          useSearch: false,
          level: 'básico',
          contexto: contextStr,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: data.reply || 'No obtuve respuesta en este momento.',
          modelUsed: data.modelUsed,
          sources: Array.isArray(data.sources) ? data.sources : [],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: 'Hubo un problema temporal de conexión. Recuerda que tu cuenta mantiene activo el escudo VaR del 2.5% y comisiones de 0.10%.',
          modelUsed: 'respaldo local',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold shadow-lg border border-slate-700 dark:border-emerald-500/40 transition-colors cursor-pointer"
          aria-label="Abrir asistente financiero"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Asesoría IA</span>
        </button>
      ) : (
        <div
          className="w-[calc(100vw-2rem)] sm:w-[410px] h-[540px] max-h-[82vh] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col overflow-hidden"
          role="dialog"
          aria-label="Asistente Multi-Turno Smart Invest"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  Asistente Gemini · Smart Invest
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Contexto activo: {selectedSymbol} · VaR {portfolioVarPct.toFixed(2)}%
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setMessages([
                    {
                      id: `bot-reset-${Date.now()}`,
                      role: 'model',
                      text: `Conversación reiniciada. ¿Qué analizamos sobre ${selectedSymbol} o tu portafolio?`,
                      modelUsed: 'gemini-3.1-flash-lite',
                    },
                  ])
                }
                title="Nueva conversación"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar asistente"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Modelo único activo: Flash-Lite */}
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-600 text-white">
              Flash-Lite (gemini-3.1-flash-lite)
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Respuesta rápida</span>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`p-3 rounded-xl text-xs sm:text-sm whitespace-pre-line leading-relaxed max-w-[90%] ${
                  m.role === 'user'
                    ? 'ml-auto bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                }`}
              >
                <div>{m.text}</div>
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-700 space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wide opacity-75">
                      Fuentes Google Search:
                    </div>
                    {m.sources.map((src, idx) => (
                      <a
                        key={`${src.uri}-${idx}`}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-300 hover:underline truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{src.title}</span>
                      </a>
                    ))}
                  </div>
                )}
                {m.modelUsed && (
                  <div className="mt-1.5 text-[10px] font-mono opacity-65">
                    {m.modelUsed}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-300 max-w-[75%]">
                Analizando respuesta con Flash-Lite...
              </div>
            )}
            <div ref={threadEndRef} />
          </div>

          {/* Sugerencia contextual rápida */}
          <div className="px-3 pb-1.5 flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() =>
                handleSend(`¿Qué noticias recientes hay hoy sobre ${selectedSymbol} y qué riesgos debo cuidar?`)
              }
              className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 text-[11px] font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Noticias {selectedSymbol} hoy
            </button>
            <button
              type="button"
              onClick={() => handleSend('¿Cómo diversifico mejor mi portafolio actual?')}
              className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 text-[11px] font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              ¿Cómo diversifico?
            </button>
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2 bg-white dark:bg-slate-900"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Pregunta sobre ${selectedSymbol} o finanzas...`}
              className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              aria-label="Enviar mensaje"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
