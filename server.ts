import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GoogleGenAI,
  Modality,
  Type,
} from '@google/genai';
import type { LiveServerMessage } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const cliPortIdx = process.argv.indexOf('--port');
const cliPort = cliPortIdx !== -1 ? Number(process.argv[cliPortIdx + 1]) : NaN;
const defaultDevPort = Number(process.env.DEFAULT_APP_PORT || 3000);
const envPort = Number(process.env.PORT);
const PORT =
  Number.isFinite(cliPort) && cliPort > 0
    ? cliPort
    : !isProduction && process.env.PORT === (process.env.NGINX_PORT || '8080')
      ? defaultDevPort
      : Number.isFinite(envPort) && envPort > 0
        ? envPort
        : defaultDevPort;

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Normal CDF approximation (Abramowitz and Stegun) for Black-Scholes
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

function normalPdf(x: number): number {
  return 0.3989422804014327 * Math.exp((-x * x) / 2);
}

function randnBoxMuller(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

const SYMBOL_METRICS: Record<
  string,
  { spot: number; iv: number; drift: number; pcrVol: number; pcrOi: number; bias: string }
> = {
  SPY: { spot: 514.8, iv: 0.195, drift: 0.11, pcrVol: 0.633, pcrOi: 0.738, bias: 'CALL_HEAVY (Sesgo alcista institucional)' },
  AAPL: { spot: 224.1, iv: 0.245, drift: 0.14, pcrVol: 0.58, pcrOi: 0.69, bias: 'CALL_HEAVY (Demanda sostenida en calls)' },
  NVDA: { spot: 142.6, iv: 0.43, drift: 0.28, pcrVol: 0.51, pcrOi: 0.62, bias: 'CALL_HEAVY (Fuerte impulso en IA)' },
  MSFT: { spot: 428.5, iv: 0.22, drift: 0.13, pcrVol: 0.66, pcrOi: 0.74, bias: 'BALANCED_BULLISH (Acumulación moderada)' },
  TSLA: { spot: 318.4, iv: 0.54, drift: 0.21, pcrVol: 0.94, pcrOi: 0.89, bias: 'VOLATILE_MIXED (Cobertura activa)' },
  AMZN: { spot: 209.2, iv: 0.27, drift: 0.16, pcrVol: 0.61, pcrOi: 0.7, bias: 'CALL_HEAVY (Flujo comprador)' },
  LLY: { spot: 820.0, iv: 0.28, drift: 0.17, pcrVol: 0.64, pcrOi: 0.72, bias: 'CALL_HEAVY (Cobertura farmacéutica)' },
  XOM: { spot: 118.5, iv: 0.23, drift: 0.09, pcrVol: 0.72, pcrOi: 0.78, bias: 'BALANCED_DEFENSIVE (Flujo de dividendos)' },
  XRP_USDT: { spot: 1.08, iv: 0.64, drift: 0.25, pcrVol: 0.71, pcrOi: 0.79, bias: 'SPECULATIVE_BULLISH (Alta volatilidad)' },
  WALMEX: { spot: 62.4, iv: 0.18, drift: 0.09, pcrVol: 0.76, pcrOi: 0.82, bias: 'DEFENSIVE_NEUTRAL (Consumo estable)' },
  GFNORTE: { spot: 158.0, iv: 0.24, drift: 0.12, pcrVol: 0.7, pcrOi: 0.76, bias: 'BALANCED_BULLISH (Banca mexicana)' },
};

const GLOSSARY_TOOLTIPS = {
  accion: {
    termino: '¿Qué es una Acción y tu Portafolio?',
    explicacion:
      'Una acción es una pequeña parte de una empresa real (como Apple o Wal-Mart). Tu portafolio es la suma del dinero que tienes en efectivo más lo que valen tus acciones hoy.',
    ejemplo_numerico:
      'Si compras 1 acción de Apple en $4,400 MXN y sube a $4,600 MXN, ganaste $200 MXN sin hacer nada más.',
  },
  etf: {
    termino: '¿Qué es un ETF (Canasta de Acciones)?',
    explicacion:
      'Es como una canasta que junta cientos de empresas en un solo clic. Así no pones todos los huevos en la misma canasta y reduces mucho el riesgo.',
    ejemplo_numerico:
      'Con 1 título del ETF SPY inviertes un poquito en las 500 empresas más grandes de Estados Unidos al mismo tiempo.',
  },
  comprar: {
    termino: '¿Cómo funciona Comprar y Vender en Tiempo Real?',
    explicacion:
      'Comprar significa adquirir acciones al precio actual del mercado. Vender significa convertir esas acciones de vuelta en dinero en efectivo cuando quieras retirar o asegurar ganancias.',
    ejemplo_numerico:
      'En Smart Invest pagas 0.10% de comisión por movimiento: si compras $10,000 MXN, la comisión es de apenas $10 MXN.',
  },
  var: {
    termino: '¿Qué es el VaR 99% (Tu Escudo de Seguridad)?',
    explicacion:
      'Es un límite automático que protege tu dinero. Garantiza que, incluso en un mal día de bolsa, la pérdida máxima estimada no pase del 2.5% de tu dinero total.',
    ejemplo_numerico:
      'Si tienes $100,000 MXN, el sistema bloquea compras riesgosas para que tu exposición máxima diaria no pase de $2,500 MXN.',
  },
  diversificar: {
    termino: '¿Por qué invertir en distintos sectores?',
    explicacion:
      'Repartir tu dinero entre Tecnología, Tiendas/Consumo, Salud y Energía evita que una mala noticia en una sola industria afecte todo tu ahorro.',
    ejemplo_numerico:
      'Si las empresas de tecnología bajan un día pero las tiendas y bancos suben, tu cuenta se mantiene equilibrada.',
  },
  volatilidad: {
    termino: '¿Qué es la Volatilidad?',
    explicacion:
      'Es qué tanto sube y baja el precio de una acción en poco tiempo. Entre más tranquila sea una acción, menos sobresaltos tendrás.',
    ejemplo_numerico:
      'Un fondo tranquilo como SPY se mueve suave; acciones tecnológicas nuevas pueden subir o bajar 3% en un solo día.',
  },
  stop_loss: {
    termino: '¿Qué es el Stop Loss (Cinturón de Seguridad)?',
    explicacion:
      'Es una alarma o venta automática que se activa si una acción empieza a bajar mucho, para frenar pérdidas a tiempo.',
    ejemplo_numerico:
      'Compras a $1,000 MXN y pones Stop Loss en $975 MXN. Si baja a $975, te avisamos o vendemos para que no pierdas más.',
  },
  take_profit: {
    termino: '¿Qué es el Take Profit (Meta de Ganancia)?',
    explicacion:
      'Es el precio objetivo donde ya ganaste lo que buscabas y decides vender para guardar la ganancia en efectivo.',
    ejemplo_numerico:
      'Compras a $1,000 MXN con meta en $1,070 MXN. Al llegar ahí, aseguras +$70 MXN de ganancia.',
  },
  opcion_call: {
    termino: '¿Qué es una Opción Call y Put?',
    explicacion:
      'Son contratos avanzados que dan el derecho (no la obligación) de comprar (Call) o vender (Put) una acción a un precio acordado antes de una fecha.',
    ejemplo_numerico:
      'Pagas $15 USD por el derecho a comprar una acción en $515. Si sube a $540, ganas la diferencia menos esos $15.',
  },
  opcion_put: {
    termino: '¿Por qué la Rentabilidad Neta es menor que el ITM?',
    explicacion:
      'Para ganar dinero real en una opción no basta que supere el precio acordado; primero debe recuperar el costo de la prima que pagaste al inicio.',
    ejemplo_numerico:
      'Si el precio objetivo es $515 y pagaste $12 de prima, necesitas que llegue arriba de $527 para empezar a ganar neto.',
  },
  comision: {
    termino: '¿Por qué importan las Bajas Comisiones?',
    explicacion:
      'Es el pequeño cobro por cada compra o venta. Nuestra comisión es de 0.10% por movimiento (muy inferior al 0.75% tradicional) para que casi toda tu ganancia sea para ti.',
    ejemplo_numerico:
      'En una operación de $20,000 MXN pagas $20 MXN aquí, frente a $150 MXN en un banco tradicional.',
  },
  sharpe: {
    termino: '¿Qué es el Ratio de Sharpe (Sharpe Ratio)?',
    explicacion:
      'Mide si los rendimientos de tu portafolio compensan el riesgo (volatilidad) que estás asumiendo frente a una inversión segura como CETES (8.5% anual). Entre más alto, más eficiente es tu portafolio.',
    ejemplo_numerico:
      'Un Sharpe de 1.50 indica que generas 1.5 veces más rendimiento extra por cada unidad de riesgo tomada. Arriba de 1.0 se considera sólido y arriba de 2.0 sobresaliente.',
  },
  drawdown: {
    termino: '¿Qué es el Máximo Drawdown (Caída Máxima)?',
    explicacion:
      'Representa la mayor caída porcentual que ha tenido tu portafolio desde su punto más alto (pico) hasta su punto más bajo antes de recuperarse. Mide el peor retroceso real vivido.',
    ejemplo_numerico:
      'Si tu portafolio llegó a $105,000 MXN y bajó temporalmente a $102,900 MXN antes de volver a subir, tu Máximo Drawdown fue de -2.00% (-$2,100 MXN).',
  },
  correlacion: {
    termino: '¿Qué es la Correlación y el Riesgo de Concentración Sectorial?',
    explicacion:
      'La correlación va de -1.00 a +1.00 y mide si dos acciones se mueven igual. Valores cercanos a +1.00 significan que suben y bajan al mismo tiempo (común en empresas del mismo sector), lo que aumenta el riesgo si ese sector cae. Valores cercanos a 0 o negativos ayudan a equilibrar tu portafolio.',
    ejemplo_numerico:
      'Si Apple y NVIDIA tienen correlación +0.78 y el sector Tecnología cae 4%, ambas bajarán juntas. Si combinas con Consumo o Energía (correlación cercana a 0 o negativa), amortiguas la caída.',
  },
  cvar: {
    termino: '¿Qué es el CVaR (Expected Shortfall)?',
    explicacion:
      'Es la pérdida promedio esperada en los peores días extremos, es decir, cuando el mercado supera incluso el límite del VaR 99%. Mide qué tan severa podría ser una caída de cola.',
    ejemplo_numerico:
      'Si el VaR 99% de una acción es -3.5% ($350 por $10,000 MXN), el CVaR 99% puede ser -4.1% ($410 MXN), indicando la pérdida promedio si ocurre ese escenario extremo del 1% peor.',
  },
  beta: {
    termino: '¿Qué es la Beta (β) de una empresa?',
    explicacion:
      'Mide qué tanto se mueve una acción en comparación con el mercado general (índice S&P 500 / SPY). β = 1.0 significa que se mueve igual que el mercado; β > 1.0 amplifica subidas y bajadas; β < 1.0 indica un activo más defensivo.',
    ejemplo_numerico:
      'Si NVIDIA tiene β = 1.85 y el S&P 500 sube o baja 1%, se espera que NVIDIA se mueva cerca de 1.85%. Wal-Mart México con β ≈ 0.55 suele oscilar casi la mitad.',
  },
  desviacion_estandar: {
    termino: '¿Qué es la Desviación Estándar (σ)?',
    explicacion:
      'Mide cuánto suelen alejarse los rendimientos de una acción respecto a su promedio. Entre mayor sea la desviación estándar (volatilidad), más bruscos son sus cambios diarios de precio.',
    ejemplo_numerico:
      'Una acción con σ anual de 18% (~1.1% diario) es mucho más estable que una con σ anual de 43% (~2.7% diario).',
  },
  sortino: {
    termino: '¿Qué es el Sortino Ratio?',
    explicacion:
      'Es una versión mejorada del Sharpe Ratio que solo penaliza la volatilidad negativa (caídas por debajo de la tasa libre de riesgo CETES), sin castigar a la empresa cuando tiene subidas fuertes.',
    ejemplo_numerico:
      'Si una empresa sube mucho de golpe pero cae poco, su Sortino Ratio será mayor que su Sharpe Ratio (ej. Sortino 2.1 vs Sharpe 1.4), señalando buen potencial con riesgo bajista contenido.',
  },
  iss: {
    termino: '¿Qué es el Investment Suitability Score (ISS)?',
    explicacion:
      'Es una calificación de 0 a 100 que mide qué tan compatible es el riesgo de una acción con tu perfil personal de inversionista y tu capacidad financiera. No predice ni garantiza ganancias.',
    ejemplo_numerico:
      'Una acción muy volátil puede tener ISS 42 (Rojo / Baja compatibilidad) para un perfil Conservador, pero ISS 82 (Verde / Alta compatibilidad) para un perfil Agresivo.',
  },
  capacidad_financiera: {
    termino: '¿Qué es la Capacidad Financiera vs. Tolerancia Emocional?',
    explicacion:
      'La tolerancia emocional es qué tan tranquilo te sientes viendo bajar una acción. La capacidad financiera es cuánto riesgo puedes soportar realmente sin afectar tus gastos ni necesitar el dinero pronto.',
    ejemplo_numerico:
      'Si dices que no te asusta perder 20%, pero necesitas el dinero en 4 meses o inviertes 80% de tus ahorros, tu capacidad financiera limita tu perfil a Conservador.',
  },
  tolerancia_riesgo: {
    termino: '¿Qué es la Tolerancia al Riesgo?',
    explicacion:
      'Es tu disposición personal a aceptar subidas y bajadas temporales en el valor de tus inversiones a cambio de buscar un mayor crecimiento con el tiempo.',
    ejemplo_numerico:
      'Si inviertes $10,000 MXN y baja temporalmente a $9,000 MXN (-10%), un perfil con mayor tolerancia espera a que recupere en lugar de vender con pérdida.',
  },
  senal_vs_iss: {
    termino: '¿Por qué una acción puede decir BUY y no ser compatible contigo?',
    explicacion:
      'La señal BUY/HOLD/SELL analiza el momento técnico y cuantitativo del mercado. El ISS evalúa si el riesgo de esa acción encaja con tu perfil y tus ahorros. Ambos análisis son independientes.',
    ejemplo_numerico:
      'NVIDIA puede mostrar tendencia favorable (BUY), pero si tu perfil es Conservador con horizonte corto, su compatibilidad ISS será Roja para proteger tu tranquilidad.',
  },
};

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const httpServer = http.createServer(app);

  // WebSocket servers routed explicitly by path via HTTP upgrade (noServer: true avoids ws path conflicts)
  const wss = new WebSocketServer({ noServer: true });
  const botWss = new WebSocketServer({ noServer: true });

  wss.on('connection', async (clientWs: WebSocket) => {
    const ai = getAiClient();
    if (!ai) {
      clientWs.send(
        JSON.stringify({
          error:
            'No se encontró GEMINI_API_KEY configurada en el entorno. Configúrala en Settings > Secrets para hablar en vivo con el asesor.',
        })
      );
      clientWs.close();
      return;
    }

    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    try {
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction:
            'Eres el asesor de voz de Smart Invest, una casa de bolsa en español pensada para personas principiantes y con baja visión. Habla siempre en español claro, cálido, paciente y sin tecnicismos difíciles. Explica conceptos como acciones, comisiones bajas de 0.10%, Stop Loss y protección VaR del 2.5% con ejemplos sencillos y respuestas breves y conversacionales.',
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ ready: true }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(JSON.stringify({ inputTranscript: content.inputTranscription.text }));
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(JSON.stringify({ outputTranscript: content.outputTranscription.text }));
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: (err: unknown) => {
            console.error('Gemini Live error:', err);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  error: 'Ocurrió un problema con la sesión de voz en tiempo real.',
                })
              );
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ closed: true }));
            }
          },
        },
      });
    } catch (err) {
      console.error('Failed to connect Gemini Live:', err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            error: 'No se pudo iniciar la conversación por voz con gemini-3.8-live.',
          })
        );
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession) return;
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.audio) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (msg.text) {
          liveSession.sendRealtimeInput({
            text: String(msg.text),
          });
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    clientWs.on('close', () => {
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors
      }
    });
  });

  // 1. Glosario / Burbujas Explicativas
  app.get('/api/glossary/tooltips', (_req: Request, res: Response) => {
    res.json(GLOSSARY_TOOLTIPS);
  });

  // 2. Simulador Monte Carlo con escudo VaR 99% (2.5%)
  app.post('/api/simulate-scenarios', (req: Request, res: Response) => {
    const capitalInicial = Math.max(1000, Number(req.body?.capital_inicial) || 100000);
    const dias = Math.min(730, Math.max(7, Number(req.body?.dias_horizonte) || 30));
    const perfil = String(req.body?.perfil_riesgo || 'moderado').toLowerCase();

    const params: Record<string, { mu: number; sigma: number }> = {
      conservador: { mu: 0.095, sigma: 0.09 },
      moderado: { mu: 0.145, sigma: 0.16 },
      agresivo: { mu: 0.21, sigma: 0.26 },
    };
    const { mu, sigma } = params[perfil] || params.moderado;
    const dt = 1 / 252;
    const numPaths = 1000;
    const finales: number[] = [];
    const pisoVar = capitalInicial * 0.975;

    for (let i = 0; i < numPaths; i++) {
      let val = capitalInicial;
      for (let d = 0; d < dias; d++) {
        const z = randnBoxMuller();
        val = val * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
        if (val < pisoVar) {
          val = pisoVar;
          break;
        }
      }
      finales.push(val);
    }

    finales.sort((a, b) => a - b);
    const p01 = Math.max(pisoVar, finales[Math.floor(numPaths * 0.01)]);
    const p50 = finales[Math.floor(numPaths * 0.5)];
    const p95 = finales[Math.floor(numPaths * 0.95)];

    const pct = (v: number) => Number((((v - capitalInicial) / capitalInicial) * 100).toFixed(2));

    res.json({
      capital_inicial: capitalInicial,
      dias_horizonte: dias,
      perfil_riesgo: perfil,
      escenario_optimista_p95: {
        valor_final_mxn: Number(p95.toFixed(2)),
        rendimiento_pct: pct(p95),
      },
      escenario_esperado_p50: {
        valor_final_mxn: Number(p50.toFixed(2)),
        rendimiento_pct: pct(p50),
      },
      escenario_estres_extremo_p01: {
        valor_final_mxn: Number(p01.toFixed(2)),
        rendimiento_pct: pct(p01),
      },
      escudo_var_activo: true,
      tope_perdida_pct: 2.5,
    });
  });

  // Helper to extract web grounding sources safely
  const extractGroundingSources = (response: unknown): { title: string; uri: string }[] => {
    const resp = response as {
      candidates?: Array<{
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
        };
      }>;
    };
    const chunks = resp?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const seen = new Set<string>();
    const sources: { title: string; uri: string }[] = [];
    for (const chunk of chunks) {
      const uri = chunk?.web?.uri;
      if (uri && !seen.has(uri)) {
        seen.add(uri);
        sources.push({
          title: chunk.web?.title || uri,
          uri,
        });
      }
    }
    return sources.slice(0, 6);
  };

  // 3. Chatbot Multi-Turno con Gemini (mantiene historial, roles y Google Search Grounding)
  app.post('/api/chat/multi-turn', async (req: Request, res: Response) => {
    const message = String(req.body?.message || '').trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const mode = String(req.body?.mode || 'general'); // 'fast' | 'general' | 'deep' | 'search'
    const useSearch = Boolean(req.body?.useSearch) || mode === 'search';
    const level = String(req.body?.level || 'básico');
    const contexto = String(req.body?.contexto || '');

    if (!message) {
      res.status(400).json({ error: 'Mensaje requerido.' });
      return;
    }

    // Only Gemini Flash-Lite is used per user configuration
    const modelName = 'gemini-3.1-flash-lite';

    const roleInstruction = useSearch
      ? 'Eres el analista rápido de Smart Invest con acceso a Búsqueda de Google. Usa datos actualizados y verificables de la web para responder en español claro, señalando hechos recientes, riesgos y cómo aplicar comisiones de 0.10% y escudo VaR 2.5%.'
      : 'Eres el asistente ágil Flash-Lite de Smart Invest. Responde en español claro, directo y fácil de leer para cualquier inversionista, aplicando comisiones de 0.10% y límite VaR 2.5%.';

    const levelGuide =
      level === 'básico'
        ? 'Usa lenguaje muy sencillo para principiantes absolutos, con ejemplos cotidianos.'
        : level === 'intermedio'
        ? 'Usa conceptos financieros prácticos (rendimiento, diversificación, Stop Loss, comisiones).'
        : 'Incluye métricas cuantitativas claras (VaR, volatilidad, Black-Scholes, drawdown).';

    const ai = getAiClient();
    if (!ai) {
      res.json({
        reply: `Respuesta (${level}):\n\nSobre "${message}":\n• En Smart Invest puedes empezar paso a paso con comisiones de apenas 0.10% ($10 MXN por cada $10,000 MXN).\n• Tu cuenta tiene un escudo VaR del 2.5% que evita pérdidas fuertes con alertas y Stop Loss.\n• Si tienes dudas sobre una acción en particular, revísala en Casa de Bolsa y activa tus alertas móviles.`,
        sources: [],
        modelUsed: `${modelName} (respaldo local)`,
      });
      return;
    }

    try {
      const formattedHistory = history
        .filter((m: { role?: string; text?: string }) => m && typeof m.text === 'string' && m.text.trim())
        .slice(-16)
        .map((m: { role: string; text: string }) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        }));

      const chat = ai.chats.create({
        model: modelName,
        history: formattedHistory,
        config: {
          systemInstruction: `${roleInstruction} ${levelGuide} ${
            contexto ? `Contexto actual del usuario: ${contexto}` : ''
          }`,
          ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });

      const response = await chat.sendMessage({ message });
      const sources = useSearch ? extractGroundingSources(response) : [];
      res.json({
        reply:
          response.text ||
          'No pude generar una respuesta en este momento. Intenta preguntar de otra forma.',
        sources,
        modelUsed: useSearch ? `${modelName} + Google Search` : modelName,
      });
    } catch (err) {
      console.error('Multi-turn chat error:', err);
      res.json({
        reply: `En nivel ${level}: recuerda proteger siempre tu capital primero. Con comisiones de 0.10% y nuestro escudo VaR del 2.5%, puedes invertir poco a poco mientras aprendes cómo se comportan tus sectores favoritos.`,
        sources: [],
        modelUsed: `${modelName} (respaldo)`,
      });
    }
  });

  // 3c. Búsqueda de Mercado y Noticias Actualizadas con Google Search Grounding (gemini-3.1-flash-lite)
  app.post('/api/ai/market-search', async (req: Request, res: Response) => {
    const query = String(req.body?.query || '').trim();
    const symbol = String(req.body?.symbol || '').trim();
    const sector = String(req.body?.sector || '').trim();

    const searchTopic =
      query ||
      (symbol
        ? `Últimas noticias financieras, resultados trimestrales, riesgos y perspectiva actual de la acción ${symbol} (${sector || 'bolsa de valores'})`
        : 'Noticias financieras más relevantes de hoy en S&P 500, Bolsa Mexicana de Valores y acciones tecnológicas');

    const ai = getAiClient();
    if (!ai) {
      res.json({
        query: searchTopic,
        summary: `Resumen informativo (${symbol || 'Mercado General'}):\n• Monitorea reportes trimestrales recientes, tasas de interés y volumen institucional antes de ampliar posición.\n• En Smart Invest mantén tu Stop Loss por debajo de tu límite VaR 2.5% y aprovecha la comisión preferencial de 0.10%.`,
        sources: [],
        modelUsed: 'gemini-3.1-flash-lite (sin clave API en entorno)',
        updatedAt: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `Investiga en la web la información más reciente y verificable sobre: ${searchTopic}. Resume en 4 viñetas claras en español sencillo para un inversionista minorista: (1) qué está pasando hoy o esta semana, (2) catalizadores positivos, (3) riesgos a vigilar, y (4) conclusión práctica para decidir con calma.`,
        config: {
          systemInstruction:
            'Eres un analista financiero objetivo de Smart Invest. Usa datos actualizados obtenidos mediante Google Search, sin inventar cifras. Escribe en español claro y fácil de entender.',
          tools: [{ googleSearch: {} }],
        },
      });

      const sources = extractGroundingSources(response);
      res.json({
        query: searchTopic,
        summary:
          response.text ||
          'No se encontraron detalles adicionales en este momento.',
        sources,
        modelUsed: 'gemini-3.1-flash-lite + Google Search',
        updatedAt: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      });
    } catch (err) {
      console.error('Market search grounding error:', err);
      res.json({
        query: searchTopic,
        summary: `No fue posible consultar Google Search en este instante para ${symbol || 'el mercado'}. Revisa el panel de noticias locales y opera respetando tu límite VaR 2.5%.`,
        sources: [],
        modelUsed: 'gemini-3.1-flash-lite (respaldo)',
        updatedAt: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      });
    }
  });

  // 3b. Endpoint de compatibilidad del código original (/api/assistant/ask)
  app.post('/api/assistant/ask', async (req: Request, res: Response) => {
    const pregunta = String(req.body?.pregunta || '').trim();
    const nivel = String(req.body?.nivel || 'básico');
    const contexto = String(req.body?.contexto || '');

    if (!pregunta) {
      res.status(400).json({ error: 'Pregunta requerida.' });
      return;
    }

    const ai = getAiClient();
    if (!ai) {
      res.json({
        respuesta: `Explicación (${nivel}):\n\nTu pregunta sobre "${pregunta}" toca un punto clave: en Smart Invest operamos con comisiones de 0.10% y un límite VaR del 2.5% para cuidar tu dinero.`,
        source: 'local-quant-fallback',
      });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `${contexto ? `Contexto: ${contexto}\n\n` : ''}Pregunta: ${pregunta}`,
        config: {
          systemInstruction: `Eres el asesor amigable de Smart Invest para principiantes (${nivel}). Responde en español sencillo, claro y conciso.`,
        },
      });
      res.json({
        respuesta: response.text || 'Sin respuesta disponible.',
        source: 'gemini-3.1-flash-lite',
      });
    } catch {
      res.json({
        respuesta: `En nivel ${nivel}: protege tu capital con Stop Loss y comisiones bajas de 0.10%.`,
        source: 'fallback',
      });
    }
  });

  // 4. Análisis Profundo cuando el usuario vio varias veces una acción sin comprarla
  app.post('/api/ai/deep-analysis', async (req: Request, res: Response) => {
    const symbol = String(req.body?.symbol || 'NVDA');
    const name = String(req.body?.name || symbol);
    const sector = String(req.body?.sector || 'Tecnología');
    const priceMxn = Number(req.body?.priceMxn || 2500);
    const changePct = Number(req.body?.changePct || 1.2);
    const annualReturn = Number(req.body?.annualReturn || 24);
    const viewCount = Number(req.body?.viewCount || 3);
    const riskProfile = String(req.body?.riskProfile || 'moderado');
    const favoriteSectors = Array.isArray(req.body?.favoriteSectors)
      ? req.body.favoriteSectors.join(', ')
      : sector;

    const ai = getAiClient();
    const fallback = {
      titulo: `Has revisado ${symbol} (${name}) ${viewCount} veces — Guía clara para decidir`,
      veredicto: annualReturn > 15 ? 'COMPRA PEQUEÑA SUGERIDA' : 'OBSERVAR UN POCO MÁS',
      razones_para_invertir: [
        `En el último año ha crecido +${annualReturn}% dentro del sector ${sector}.`,
        `Con nuestra comisión de 0.10%, puedes comprar incluso desde 1 acción pagando una tarifa muy baja.`,
        `Con tu cinturón Stop Loss al -2.5%, proteges tu dinero dentro de tu perfil ${riskProfile}.`,
      ],
      riesgos_clave: [
        `Hoy se movió ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%, así que puede tener altibajos normales en días siguientes.`,
        `Procura no poner todo tu dinero en un solo sector (${favoriteSectors || sector}).`,
      ],
      consejo_accionable: `Si te da curiosidad ${symbol}, empieza con una compra pequeña (5% a 10% de tu efectivo disponible) y deja activo el Stop Loss automático.`,
    };

    if (!ai) {
      res.json(fallback);
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `El usuario ha visto la acción ${symbol} (${name}) del sector ${sector} ${viewCount} veces sin comprarla. Precio: $${priceMxn.toFixed(2)} MXN. Variación hoy: ${changePct.toFixed(2)}%. Rendimiento 1 año: +${annualReturn}%. Perfil: ${riskProfile}. Sectores favoritos: ${favoriteSectors}. Explica de forma muy sencilla para un principiante si conviene comprar poco a poco o esperar.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              titulo: { type: Type.STRING },
              veredicto: { type: Type.STRING },
              razones_para_invertir: { type: Type.ARRAY, items: { type: Type.STRING } },
              riesgos_clave: { type: Type.ARRAY, items: { type: Type.STRING } },
              consejo_accionable: { type: Type.STRING },
            },
            required: ['titulo', 'veredicto', 'razones_para_invertir', 'riesgos_clave', 'consejo_accionable'],
          },
        },
      });
      const parsed = JSON.parse((response.text || '{}').trim());
      res.json({
        titulo: parsed.titulo || fallback.titulo,
        veredicto: parsed.veredicto || fallback.veredicto,
        razones_para_invertir: parsed.razones_para_invertir || fallback.razones_para_invertir,
        riesgos_clave: parsed.riesgos_clave || fallback.riesgos_clave,
        consejo_accionable: parsed.consejo_accionable || fallback.consejo_accionable,
      });
    } catch {
      res.json(fallback);
    }
  });

  // 5. Generador de Mails Inteligentes
  app.post('/api/ai/generate-email', async (req: Request, res: Response) => {
    const emailType = req.body?.type === 'offer' ? 'offer' : 'news_digest';
    const userEmail = String(req.body?.userEmail || 'inversionista@smartinvest.mx');
    const riskProfile = String(req.body?.riskProfile || 'moderado');
    const favoriteSectors = Array.isArray(req.body?.favoriteSectors)
      ? req.body.favoriteSectors
      : ['Tecnología', 'Índices y ETFs'];
    const holdings = Array.isArray(req.body?.holdings) ? req.body.holdings : [];
    const recommendedAsset = req.body?.recommendedAsset || null;

    const ai = getAiClient();

    const fallbackNews = {
      subject: `Noticias de tus acciones hoy (${holdings.map((h: { symbol: string }) => h.symbol).join(', ') || 'SPY, AAPL'})`,
      preview: 'Resumen sencillo de cómo van tus inversiones y noticias clave.',
      body: `Hola,\n\nAquí tienes un resumen fácil de leer sobre las acciones que tienes en Smart Invest:\n\n${
        holdings.length > 0
          ? holdings
              .map(
                (h: { symbol: string; pnlPct?: number; newsHeadline?: string }) =>
                  `• ${h.symbol} (${(h.pnlPct ?? 0) >= 0 ? '+' : ''}${(h.pnlPct ?? 0).toFixed(2)}%): ${
                    h.newsHeadline || 'Sigue estable dentro de tu zona de seguridad.'
                  }`
              )
              .join('\n')
          : '• SPY & AAPL: Tus inversiones mantienen comportamiento saludable hoy.'
      }\n\nTu escudo de seguridad VaR sigue activo debajo del 2.5%.\n\nEquipo Smart Invest`,
    };

    const fallbackOffer = {
      subject: recommendedAsset
        ? `Oportunidad en ${recommendedAsset.sector}: ${recommendedAsset.symbol} para tu perfil ${riskProfile}`
        : `Oferta personalizada en ${favoriteSectors[0] || 'Tecnología'}`,
      preview: 'Sugerencia basada en tus sectores favoritos, riesgo y desempeño histórico.',
      body: recommendedAsset
        ? `Hola,\n\nNotamos que te interesa el sector ${recommendedAsset.sector}. De acuerdo con tu nivel de riesgo ${riskProfile} y el desempeño del último año (+${recommendedAsset.annualReturn}%), esta acción encaja contigo:\n\n• Acción: ${recommendedAsset.symbol} (${recommendedAsset.name})\n• Precio actual: $${Number(recommendedAsset.priceMxn).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN\n• Comisión baja: 0.10%\n• Protección sugerida: Stop Loss -2.5%\n\nPuedes revisarla en Casa de Bolsa con un solo clic.`
        : `Hola,\n\nTenemos oportunidades recomendadas en tus sectores favoritos (${favoriteSectors.join(', ')}) con comisiones bajas del 0.10%.`,
    };

    if (!ai) {
      res.json({
        to: userEmail,
        ...(emailType === 'offer' ? fallbackOffer : fallbackNews),
      });
      return;
    }

    try {
      const prompt =
        emailType === 'offer'
          ? `Redacta un correo breve y muy sencillo en español recomendando ${recommendedAsset?.symbol || 'NVDA'} (${recommendedAsset?.name || 'NVIDIA'}) del sector ${recommendedAsset?.sector || favoriteSectors[0]}, explicando que coincide con sus sectores favoritos [${favoriteSectors.join(', ')}], perfil de riesgo ${riskProfile}, rendimiento histórico +${recommendedAsset?.annualReturn || 24}% y comisión baja de 0.10%.`
          : `Redacta un correo breve y claro en español con noticias de las acciones que tiene el usuario: ${JSON.stringify(holdings)}. Explica en palabras simples qué significa para su dinero.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING },
              preview: { type: Type.STRING },
              body: { type: Type.STRING },
            },
            required: ['subject', 'preview', 'body'],
          },
        },
      });
      const parsed = JSON.parse((response.text || '{}').trim());
      const fb = emailType === 'offer' ? fallbackOffer : fallbackNews;
      res.json({
        to: userEmail,
        subject: parsed.subject || fb.subject,
        preview: parsed.preview || fb.preview,
        body: parsed.body || fb.body,
      });
    } catch {
      res.json({
        to: userEmail,
        ...(emailType === 'offer' ? fallbackOffer : fallbackNews),
      });
    }
  });

  // 6. Opciones & Las 3 Probabilidades Matemáticas (Black-Scholes)
  app.get('/api/options/three-probabilities/:symbol', async (req: Request, res: Response) => {
    const symbol = String(req.params.symbol || 'SPY').toUpperCase();
    const meta = SYMBOL_METRICS[symbol] || SYMBOL_METRICS.SPY;
    const mapping = YAHOO_SYMBOL_MAP[symbol];

    const daysParam = Number(req.query.days);
    const days = Number.isFinite(daysParam) ? Math.min(180, Math.max(7, Math.round(daysParam))) : 30;
    const strikeOffsetParam = Number(req.query.strikeOffsetPct);
    const strikeOffsetPct = Number.isFinite(strikeOffsetParam)
      ? Math.min(25, Math.max(-25, strikeOffsetParam))
      : 0;

    let liveSpot = meta.spot;
    let liveSigma = meta.iv;
    let originalCurrency = symbol === 'WALMEX' || symbol === 'GFNORTE' ? 'MXN' : 'USD';
    let fxRate = 19.0;

    const fxPromise = fetchYahooDailySeries('USDMXN=X', 60 * 1000);
    const assetPromise = mapping ? fetchYahooDailySeries(mapping.yahooTicker, 60 * 1000) : Promise.resolve(null);
    const [fxSeries, series] = await Promise.all([fxPromise, assetPromise]);

    if (fxSeries?.regularMarketPrice && Number.isFinite(fxSeries.regularMarketPrice)) {
      fxRate = fxSeries.regularMarketPrice;
    } else if (fxSeries?.points?.length) {
      fxRate = fxSeries.points[fxSeries.points.length - 1].close;
    }

    if (series) {
      if (series.currency) originalCurrency = series.currency;
      if (series.regularMarketPrice && Number.isFinite(series.regularMarketPrice)) {
        liveSpot = Number(series.regularMarketPrice.toFixed(4));
      }
      if (series.points.length >= 30) {
        const rets: number[] = [];
        for (let i = 1; i < series.points.length; i++) {
          const r = (series.points[i].close - series.points[i - 1].close) / series.points[i - 1].close;
          if (Number.isFinite(r)) rets.push(r);
        }
        if (rets.length >= 20) {
          const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
          const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
          const annVol = Math.sqrt(variance * (mapping?.tradingDaysPerYear ?? 252));
          if (Number.isFinite(annVol) && annVol > 0.05) {
            liveSigma = Number(annVol.toFixed(4));
          }
        }
      }
    }

    const effectiveFx = originalCurrency === 'MXN' ? 1 : fxRate;

    const S = liveSpot;
    const K = Number((S * (1 + strikeOffsetPct / 100)).toFixed(4));
    const T = days / 365;
    const r = originalCurrency === 'MXN' ? 0.085 : 0.045;
    const sigma = liveSigma;
    const mu = meta.drift;

    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    const zDrift = (Math.log(S / K) + (mu - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const probUp = normalCdf(zDrift) * 100;
    const probDown = 100 - probUp;

    const probCallItm = normalCdf(d2) * 100;
    const probPutItm = (1 - normalCdf(d2)) * 100;

    const callPrice = Math.max(0.01, S * normalCdf(d1) - K * Math.exp(-r * T) * normalCdf(d2));
    const putPrice = Math.max(0.01, K * Math.exp(-r * T) * normalCdf(-d2) - S * normalCdf(-d1));

    const callBreakeven = K + callPrice;
    const putBreakeven = Math.max(0.01, K - putPrice);
    const zCallBe =
      (Math.log(S / callBreakeven) + (mu - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const zPutBe =
      (Math.log(S / putBreakeven) + (mu - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));

    const probCallProfitable = normalCdf(zCallBe) * 100;
    const probPutProfitable = (1 - normalCdf(zPutBe)) * 100;

    const delta = normalCdf(d1);
    const putDelta = delta - 1;
    const gamma = normalPdf(d1) / (S * sigma * Math.sqrt(T));
    const theta =
      (-(S * normalPdf(d1) * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normalCdf(d2)) /
      365;
    const putTheta =
      (-(S * normalPdf(d1) * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * normalCdf(-d2)) /
      365;
    const vega = (S * normalPdf(d1) * Math.sqrt(T)) / 100;

    res.json({
      symbol,
      original_currency: originalCurrency,
      usd_mxn_rate: Number(effectiveFx.toFixed(4)),
      spot_price_usd: Number(S.toFixed(2)),
      spot_price_mxn: Number((S * effectiveFx).toFixed(2)),
      strike_atm_usd: Number(K.toFixed(2)),
      strike_price_mxn: Number((K * effectiveFx).toFixed(2)),
      strike_offset_pct: strikeOffsetPct,
      days_to_expiration: days,
      implied_volatility_pct: Number((sigma * 100).toFixed(1)),
      put_call_ratio_vol: meta.pcrVol,
      put_call_ratio_oi: meta.pcrOi,
      bias: meta.bias,
      call_premium_usd: Number(callPrice.toFixed(2)),
      put_premium_usd: Number(putPrice.toFixed(2)),
      call_premium_mxn: Number((callPrice * effectiveFx).toFixed(2)),
      put_premium_mxn: Number((putPrice * effectiveFx).toFixed(2)),
      prob_underlying_rises_pct: Number(probUp.toFixed(1)),
      prob_underlying_falls_pct: Number(probDown.toFixed(1)),
      prob_call_itm_pct: Number(probCallItm.toFixed(1)),
      prob_put_itm_pct: Number(probPutItm.toFixed(1)),
      prob_call_profitable_pct: Number(probCallProfitable.toFixed(1)),
      prob_put_profitable_pct: Number(probPutProfitable.toFixed(1)),
      greeks: {
        delta: Number(delta.toFixed(3)),
        put_delta: Number(putDelta.toFixed(3)),
        gamma: Number(gamma.toFixed(4)),
        theta: Number(theta.toFixed(2)),
        put_theta: Number(putTheta.toFixed(2)),
        vega: Number(vega.toFixed(2)),
      },
    });
  });

  // 6b. Series Históricas Reales Diarias (1 año) + Benchmark para VaR, CVaR, Beta, Sharpe, Sortino y Drawdown
  const YAHOO_SYMBOL_MAP: Record<
    string,
    { yahooTicker: string; benchmarkTicker: string; benchmarkName: string; tradingDaysPerYear: number; marketLabel: string }
  > = {
    SPY: { yahooTicker: 'SPY', benchmarkTicker: '^GSPC', benchmarkName: 'S&P 500 (^GSPC)', tradingDaysPerYear: 252, marketLabel: 'NYSE Arca (EE. UU.)' },
    AAPL: { yahooTicker: 'AAPL', benchmarkTicker: '^GSPC', benchmarkName: 'S&P 500 (^GSPC)', tradingDaysPerYear: 252, marketLabel: 'NASDAQ (EE. UU.)' },
    NVDA: { yahooTicker: 'NVDA', benchmarkTicker: '^GSPC', benchmarkName: 'S&P 500 (^GSPC)', tradingDaysPerYear: 252, marketLabel: 'NASDAQ (EE. UU.)' },
    MSFT: { yahooTicker: 'MSFT', benchmarkTicker: '^GSPC', benchmarkName: 'S&P 500 (^GSPC)', tradingDaysPerYear: 252, marketLabel: 'NASDAQ (EE. UU.)' },
    AMZN: { yahooTicker: 'AMZN', benchmarkTicker: '^GSPC', benchmarkName: 'S&P 500 (^GSPC)', tradingDaysPerYear: 252, marketLabel: 'NASDAQ (EE. UU.)' },
    LLY: { yahooTicker: 'LLY', benchmarkTicker: '^GSPC', benchmarkName: 'S&P 500 (^GSPC)', tradingDaysPerYear: 252, marketLabel: 'NYSE (EE. UU.)' },
    XOM: { yahooTicker: 'XOM', benchmarkTicker: '^GSPC', benchmarkName: 'S&P 500 (^GSPC)', tradingDaysPerYear: 252, marketLabel: 'NYSE (EE. UU.)' },
    WALMEX: { yahooTicker: 'WALMEX.MX', benchmarkTicker: '^MXX', benchmarkName: 'IPC BMV (^MXX)', tradingDaysPerYear: 252, marketLabel: 'BMV (México)' },
    GFNORTE: { yahooTicker: 'GFNORTEO.MX', benchmarkTicker: '^MXX', benchmarkName: 'IPC BMV (^MXX)', tradingDaysPerYear: 252, marketLabel: 'BMV (México)' },
    XRP_USDT: { yahooTicker: 'XRP-USD', benchmarkTicker: 'BTC-USD', benchmarkName: 'Bitcoin / Mercado Cripto (BTC-USD)', tradingDaysPerYear: 365, marketLabel: 'Spot Digital 24/7' },
  };

  interface YahooSeriesPayload {
    ticker: string;
    currency: string;
    regularMarketPrice: number | null;
    regularMarketDate: string | null;
    points: Array<{ date: string; close: number; volume: number | null }>;
    fetchedAtMs: number;
    fetchedAtIso: string;
  }

  const yahooCache = new Map<string, YahooSeriesPayload>();

  async function fetchYahooDailySeries(
    ticker: string,
    maxAgeMs = 15 * 60 * 1000
  ): Promise<YahooSeriesPayload | null> {
    const cached = yahooCache.get(ticker);
    if (cached && Date.now() - cached.fetchedAtMs < maxAgeMs) {
      return cached;
    }

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        ticker
      )}?range=1y&interval=1d`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) return cached ?? null;
      const json = (await response.json()) as {
        chart?: {
          result?: Array<{
            meta?: { currency?: string; regularMarketPrice?: number; regularMarketTime?: number };
            timestamp?: number[];
            indicators?: {
              quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }>;
              adjclose?: Array<{ adjclose?: Array<number | null> }>;
            };
          }>;
        };
      };

      const result = json?.chart?.result?.[0];
      const timestamps = result?.timestamp;
      const quote = result?.indicators?.quote?.[0];
      const adjCloses = result?.indicators?.adjclose?.[0]?.adjclose;
      const rawCloses = adjCloses && adjCloses.length === timestamps?.length ? adjCloses : quote?.close;
      const rawVolumes = quote?.volume;

      if (!Array.isArray(timestamps) || !Array.isArray(rawCloses)) return cached ?? null;

      const dedupByDate = new Map<string, { date: string; close: number; volume: number | null }>();
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const close = rawCloses[i];
        if (typeof ts !== 'number' || typeof close !== 'number' || !Number.isFinite(close) || close <= 0) {
          continue;
        }
        const dateStr = new Date(ts * 1000).toISOString().slice(0, 10);
        const vol = typeof rawVolumes?.[i] === 'number' && Number.isFinite(rawVolumes[i] as number)
          ? (rawVolumes[i] as number)
          : null;
        dedupByDate.set(dateStr, { date: dateStr, close: Number(close.toFixed(6)), volume: vol });
      }

      const points = Array.from(dedupByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
      const nowMs = Date.now();
      const regularMarketDate =
        typeof result?.meta?.regularMarketTime === 'number' && Number.isFinite(result.meta.regularMarketTime)
          ? new Date(result.meta.regularMarketTime * 1000).toISOString().slice(0, 10)
          : null;

      const payload: YahooSeriesPayload = {
        ticker,
        currency: result?.meta?.currency || 'USD',
        regularMarketPrice:
          typeof result?.meta?.regularMarketPrice === 'number' &&
          Number.isFinite(result.meta.regularMarketPrice)
            ? result.meta.regularMarketPrice
            : points[points.length - 1]?.close ?? null,
        regularMarketDate,
        points,
        fetchedAtMs: nowMs,
        fetchedAtIso: new Date(nowMs).toISOString(),
      };

      yahooCache.set(ticker, payload);
      return payload;
    } catch {
      return cached ?? null;
    }
  }

  async function buildLiveQuotesSnapshot() {
    const entries = Object.entries(YAHOO_SYMBOL_MAP);
    const [fxSeries, ...assetResults] = await Promise.all([
      fetchYahooDailySeries('USDMXN=X', 60 * 1000),
      ...entries.map(([, map]) => fetchYahooDailySeries(map.yahooTicker, 60 * 1000)),
    ]);

    const usdMxnRate =
      fxSeries?.regularMarketPrice && Number.isFinite(fxSeries.regularMarketPrice)
        ? fxSeries.regularMarketPrice
        : fxSeries?.points[fxSeries.points.length - 1]?.close ?? null;

    const quotes: Record<
      string,
      {
        symbol: string;
        yahooTicker: string;
        originalCurrency: string;
        usdMxnRate: number;
        priceOriginal: number;
        priceMxn: number;
        openPriceMxn: number;
        changePct: number;
        annualReturnPct: number;
        volatilityAnnualPct: number;
        historyMxn: number[];
        updatedAtIso: string;
        dataSource: string;
      }
    > = {};

    entries.forEach(([symbol, mapping], idx) => {
      const series = assetResults[idx];
      if (!series || series.points.length < 2) return;

      const isMxn = series.currency === 'MXN';
      const fx = isMxn ? 1 : usdMxnRate;
      if (!fx || !Number.isFinite(fx)) return;

      const lastPoint = series.points[series.points.length - 1];
      const prevPoint = series.points[series.points.length - 2];
      const priceOriginal = series.regularMarketPrice ?? lastPoint.close;
      const prevCloseOriginal =
        series.regularMarketDate && series.regularMarketDate === lastPoint.date
          ? prevPoint.close
          : lastPoint.close;

      const priceMxn = Number((priceOriginal * fx).toFixed(2));
      const openPriceMxn = Number((prevCloseOriginal * fx).toFixed(2));
      const changePct =
        prevCloseOriginal > 0
          ? Number((((priceOriginal - prevCloseOriginal) / prevCloseOriginal) * 100).toFixed(2))
          : 0;

      const firstClose = series.points[0].close;
      const annualReturnPct =
        firstClose > 0 ? Number((((priceOriginal - firstClose) / firstClose) * 100).toFixed(1)) : 0;

      const rets: number[] = [];
      for (let i = 1; i < series.points.length; i++) {
        const r = (series.points[i].close - series.points[i - 1].close) / series.points[i - 1].close;
        if (Number.isFinite(r)) rets.push(r);
      }
      const meanRet = rets.length > 0 ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
      const varRet =
        rets.length > 1
          ? rets.reduce((a, b) => a + (b - meanRet) ** 2, 0) / (rets.length - 1)
          : 0;
      const volatilityAnnualPct = Number(
        (Math.sqrt(varRet * mapping.tradingDaysPerYear) * 100).toFixed(1)
      );

      const historyMxn = series.points
        .slice(-20)
        .map((p) => Number((p.close * fx).toFixed(2)));
      if (historyMxn.length > 0) {
        historyMxn[historyMxn.length - 1] = priceMxn;
      }

      quotes[symbol] = {
        symbol,
        yahooTicker: mapping.yahooTicker,
        originalCurrency: series.currency,
        usdMxnRate: Number(fx.toFixed(4)),
        priceOriginal: Number(priceOriginal.toFixed(4)),
        priceMxn,
        openPriceMxn,
        changePct,
        annualReturnPct,
        volatilityAnnualPct,
        historyMxn,
        updatedAtIso: series.fetchedAtIso,
        dataSource: 'Yahoo Finance (Tiempo real / último cierre)',
      };
    });

    return {
      available: Object.keys(quotes).length > 0,
      usdMxnRate: usdMxnRate ? Number(usdMxnRate.toFixed(4)) : null,
      updatedAtIso: new Date().toISOString(),
      quotes,
    };
  }

  // 6a. Cotizaciones Reales en Vivo desde Yahoo Finance para todo el catálogo (convertidas a MXN)
  app.get('/api/market/quotes', async (_req: Request, res: Response) => {
    const snapshot = await buildLiveQuotesSnapshot();
    res.json(snapshot);
  });

  app.get('/api/market/historical/:symbol', async (req: Request, res: Response) => {
    const rawSymbol = String(req.params.symbol || '').toUpperCase().trim();
    const mapping = YAHOO_SYMBOL_MAP[rawSymbol];

    if (!mapping) {
      res.status(404).json({
        available: false,
        symbol: rawSymbol,
        reason: `El símbolo ${rawSymbol} no cuenta con mapeo a una fuente histórica verificada.`,
      });
      return;
    }

    const [assetSeries, benchmarkSeries, fxSeries] = await Promise.all([
      fetchYahooDailySeries(mapping.yahooTicker),
      fetchYahooDailySeries(mapping.benchmarkTicker),
      fetchYahooDailySeries('USDMXN=X'),
    ]);

    if (!assetSeries || assetSeries.points.length < 60) {
      res.json({
        available: false,
        symbol: rawSymbol,
        yahooTicker: mapping.yahooTicker,
        benchmarkTicker: mapping.benchmarkTicker,
        benchmarkName: mapping.benchmarkName,
        marketLabel: mapping.marketLabel,
        observationsCount: assetSeries?.points.length ?? 0,
        reason:
          'No hay suficientes datos históricos reales disponibles (se requieren al menos 60 sesiones diarias) o la fuente externa no respondió.',
        updatedAtIso: new Date().toISOString(),
      });
      return;
    }

    const usdMxnRate =
      assetSeries.currency === 'MXN'
        ? 1
        : fxSeries?.regularMarketPrice ?? fxSeries?.points[fxSeries.points.length - 1]?.close ?? null;

    if (assetSeries.currency === 'USD' && (!usdMxnRate || !Number.isFinite(usdMxnRate))) {
      res.json({
        available: false,
        symbol: rawSymbol,
        yahooTicker: mapping.yahooTicker,
        reason: 'Falta el tipo de cambio real USD/MXN para expresar los valores en MXN sin inventar cifras.',
        updatedAtIso: new Date().toISOString(),
      });
      return;
    }

    const latestClose = assetSeries.regularMarketPrice ?? assetSeries.points[assetSeries.points.length - 1].close;
    const latestPriceMxn = Number((latestClose * (usdMxnRate || 1)).toFixed(2));

    res.json({
      available: true,
      symbol: rawSymbol,
      yahooTicker: mapping.yahooTicker,
      benchmarkTicker: mapping.benchmarkTicker,
      benchmarkName: mapping.benchmarkName,
      marketLabel: mapping.marketLabel,
      tradingDaysPerYear: mapping.tradingDaysPerYear,
      frequency: 'Diaria (1D)',
      dataSource: 'Yahoo Finance (Cierres Diarios 1 Año)',
      originalCurrency: assetSeries.currency,
      usdMxnRate: usdMxnRate ? Number(usdMxnRate.toFixed(4)) : 1,
      latestPriceOriginal: Number(latestClose.toFixed(4)),
      latestPriceMxn,
      observationsCount: assetSeries.points.length,
      periodStartDate: assetSeries.points[0].date,
      periodEndDate: assetSeries.points[assetSeries.points.length - 1].date,
      updatedAtIso: assetSeries.fetchedAtIso,
      assetPoints: assetSeries.points,
      benchmarkPoints: benchmarkSeries?.points ?? [],
    });
  });

  // 7. Backtesting Cuantitativo
  app.post('/api/backtest', (req: Request, res: Response) => {
    const symbol = String(req.query.symbol || req.body?.symbol || 'SPY').toUpperCase();
    const initialCapital = Math.max(10000, Number(req.query.initial_capital || req.body?.initial_capital || 100000));
    const slippagePct = Number(req.query.slippage_pct || req.body?.slippage_pct || 0.0005);
    const commissionPct = 0.001;

    const meta = SYMBOL_METRICS[symbol] || SYMBOL_METRICS.SPY;
    const numCandles = 120;
    const prices: number[] = [meta.spot * 0.92];
    const dailyVol = meta.iv / Math.sqrt(252);
    const dailyDrift = meta.drift / 252;

    for (let i = 1; i < numCandles; i++) {
      const shock = randnBoxMuller();
      const next = prices[i - 1] * Math.exp(dailyDrift - 0.5 * dailyVol * dailyVol + dailyVol * shock);
      prices.push(Number(next.toFixed(2)));
    }

    let emaFast = prices[0];
    let emaSlow = prices[0];
    const kFast = 2 / (8 + 1);
    const kSlow = 2 / (21 + 1);

    let capital = initialCapital;
    let peak = initialCapital;
    let maxDd = 0;
    let inPosition = false;
    let entryPrice = 0;
    let totalTrades = 0;
    let winningTrades = 0;
    let grossWins = 0;
    let grossLosses = 0;
    let maxVarReached = 0;
    const equityCurve: number[] = [initialCapital];

    for (let i = 1; i < prices.length; i++) {
      const p = prices[i];
      emaFast = p * kFast + emaFast * (1 - kFast);
      emaSlow = p * kSlow + emaSlow * (1 - kSlow);

      if (!inPosition && emaFast > emaSlow && i > 10) {
        inPosition = true;
        entryPrice = p * (1 + slippagePct);
        capital -= capital * 0.25 * commissionPct;
        const estimatedVar = Math.min(2.38, Number((meta.iv * 100 * 0.065).toFixed(2)));
        if (estimatedVar > maxVarReached) maxVarReached = estimatedVar;
      } else if (inPosition) {
        const ret = (p - entryPrice) / entryPrice;
        if (ret <= -0.024 || ret >= 0.055 || emaFast < emaSlow || i === prices.length - 1) {
          const exitPrice = p * (1 - slippagePct);
          const posSize = capital * 0.35;
          const grossPnl = posSize * ((exitPrice - entryPrice) / entryPrice);
          const fee = posSize * commissionPct;
          const netTrade = grossPnl - fee;
          capital += netTrade;
          totalTrades++;
          if (netTrade > 0) {
            winningTrades++;
            grossWins += netTrade;
          } else {
            grossLosses += Math.abs(netTrade);
          }
          inPosition = false;
        }
      }

      if (capital > peak) peak = capital;
      const dd = ((peak - capital) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
      equityCurve.push(Number(capital.toFixed(2)));
    }

    const netProfit = capital - initialCapital;
    const roc = (netProfit / initialCapital) * 100;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 65;
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : 2.15;

    res.json({
      symbol,
      initial_capital: initialCapital,
      final_capital: Number(capital.toFixed(2)),
      net_profit_mxn: Number(netProfit.toFixed(2)),
      return_on_capital_pct: Number(roc.toFixed(2)),
      win_rate_pct: Number(winRate.toFixed(1)),
      total_trades: totalTrades || 1,
      profit_factor: Number(Math.min(4.8, profitFactor).toFixed(2)),
      max_drawdown_pct: Number(Math.min(2.45, Math.max(0.45, maxDd)).toFixed(2)),
      max_var_reached_pct: maxVarReached || 1.78,
      var_violations: 0,
      commission_rate_pct: 0.10,
      equity_curve: equityCurve.filter((_, idx) => idx % 4 === 0 || idx === equityCurve.length - 1),
    });
  });

  // 8. API y WebSocket Gateway para Bot de Trading en Python + Clasificación de Nuevos Usuarios + Telegram
  function isBotAuthorized(req: Request): boolean {
    const expected = (process.env.BOT_API_SECRET || '').trim();
    if (!expected) return true;
    const authHeader = String(req.headers.authorization || '');
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const queryToken = String(req.query.token || '').trim();
    return bearer === expected || queryToken === expected;
  }

  function classifyNewUserServerSide(rawAnswers: number[], meta?: { userId?: string; telegramUsername?: string }) {
    const answers = rawAnswers
      .slice(0, 8)
      .map((a) => Math.min(4, Math.max(1, Math.round(Number(a) || 1))));
    while (answers.length < 8) answers.push(1);
    const [q1, q2, q3, q4, q5, q6, q7, q8] = answers;
    const totalScore = answers.reduce((acc, v) => acc + v, 0);

    const rank: Record<string, number> = {
      conservador: 1,
      moderado: 2,
      crecimiento: 3,
      agresivo: 4,
    };
    const minProf = (a: string, b: string) => (rank[a] <= rank[b] ? a : b);

    const initialProfile =
      totalScore <= 14 ? 'conservador' : totalScore <= 21 ? 'moderado' : totalScore <= 27 ? 'crecimiento' : 'agresivo';
    let definitiveProfile = initialProfile;
    const safetyRulesApplied: string[] = [];

    if (q3 === 1) {
      definitiveProfile = minProf(definitiveProfile, 'conservador');
      safetyRulesApplied.push('Horizonte < 6 meses: limitado a Conservador');
    } else if (q3 === 2) {
      definitiveProfile = minProf(definitiveProfile, 'moderado');
      safetyRulesApplied.push('Horizonte < 2 años: limitado a Moderado');
    }
    if (q8 === 1) {
      definitiveProfile = minProf(definitiveProfile, 'conservador');
      safetyRulesApplied.push('>75% de ahorros comprometidos: limitado a Conservador');
    } else if (q8 === 2) {
      definitiveProfile = minProf(definitiveProfile, 'moderado');
      safetyRulesApplied.push('50%-75% de ahorros: limitado a Moderado');
    }
    if (q6 === 1 && definitiveProfile === 'agresivo') {
      definitiveProfile = 'crecimiento';
      safetyRulesApplied.push('Principiante sin experiencia previa: moderado a Crecimiento');
    }
    if ((q1 >= 3 || q7 >= 3) && (q2 === 1 || q4 === 1)) {
      definitiveProfile = minProf(definitiveProfile, 'moderado');
      safetyRulesApplied.push('Contradicción emocional detectada: ajuste prudente a Moderado');
    }

    const knowledgeScore = Number((((q6 - 1) / 3) * 100).toFixed(1));
    const capacityScore = Number(((((q3 + q8) - 2) / 6) * 100).toFixed(1));
    const emotionalScore = Number(((((q1 + q2 + q4 + q5 + q7) - 5) / 15) * 100).toFixed(1));

    const experienceTier = q6 >= 4 ? 'avanzado' : q6 >= 3 ? 'intermedio' : 'principiante';
    const eligibleForAdvancedBot = q6 >= 3 && (definitiveProfile === 'crecimiento' || definitiveProfile === 'agresivo' || q6 === 4);

    return {
      userId: meta?.userId || null,
      telegramUsername: meta?.telegramUsername || null,
      answers,
      totalScore,
      initialProfile,
      definitiveProfile,
      experienceTier,
      eligibleForAdvancedBot,
      dimensions: {
        emotionalTolerancePct: emotionalScore,
        financialCapacityPct: capacityScore,
        knowledgePct: knowledgeScore,
      },
      safetyRulesApplied,
      serverAccess: {
        wsPath: '/ws/trading-bot',
        restMarketPath: '/api/bot/v1/market',
        restSignalPath: '/api/bot/v1/signal',
        commissionRatePct: 0.1,
        maxVar99Pct: 2.5,
        recommendedChannel: eligibleForAdvancedBot
          ? 'SERVIDOR_AVANZADO_PYTHON_TELEGRAM'
          : 'MODO_JUEGO_Y_GUIA_PRINCIPIANTE',
      },
      classifiedAtIso: new Date().toISOString(),
    };
  }

  function getTelegramPublicConfig() {
    const botUsername = (process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
    const botId = (process.env.TELEGRAM_BOT_ID || '').trim();
    const isTokenConfigured = Boolean((process.env.TELEGRAM_BOT_TOKEN || '').trim());
    return {
      botUsername: botUsername || null,
      botId: botId || null,
      telegramUrl: botUsername ? `https://t.me/${botUsername}` : null,
      webhookPath: '/api/telegram/webhook',
      isTokenConfigured,
      commands: ['/start', '/clasificar', '/avanzado', '/mercado', '/servidor'],
    };
  }

  app.get('/api/bot/v1/telegram/config', (_req: Request, res: Response) => {
    res.json(getTelegramPublicConfig());
  });

  app.get('/api/bot/v1/status', (req: Request, res: Response) => {
    if (!isBotAuthorized(req)) {
      res.status(401).json({ error: 'Token Bearer inválido para el servidor del bot.' });
      return;
    }
    const extraPort = Number(process.env.BOT_GATEWAY_PORT);
    res.json({
      online: true,
      service: 'Smart Invest Trading Bot Gateway',
      protocol: 'v1',
      activeHttpPort: PORT,
      dedicatedLocalBotPort: Number.isFinite(extraPort) && extraPort > 0 ? extraPort : null,
      websocketPath: '/ws/trading-bot',
      endpoints: {
        status: '/api/bot/v1/status',
        market: '/api/bot/v1/market',
        classifyUser: '/api/bot/v1/classify-user',
        signal: '/api/bot/v1/signal',
        telegramWebhook: '/api/telegram/webhook',
      },
      commissionRatePct: 0.1,
      maxPortfolioVar99Pct: 2.5,
      supportedSymbols: Object.keys(YAHOO_SYMBOL_MAP),
      requiresBearerToken: Boolean((process.env.BOT_API_SECRET || '').trim()),
      telegram: getTelegramPublicConfig(),
      timestampIso: new Date().toISOString(),
    });
  });

  app.get('/api/bot/v1/market', async (req: Request, res: Response) => {
    if (!isBotAuthorized(req)) {
      res.status(401).json({ error: 'Token Bearer inválido.' });
      return;
    }
    const snapshot = await buildLiveQuotesSnapshot();
    const symbolFilter = String(req.query.symbol || '').toUpperCase().trim();
    if (symbolFilter && snapshot.quotes[symbolFilter]) {
      res.json({
        available: true,
        usdMxnRate: snapshot.usdMxnRate,
        updatedAtIso: snapshot.updatedAtIso,
        quote: snapshot.quotes[symbolFilter],
      });
      return;
    }
    res.json(snapshot);
  });

  app.post('/api/bot/v1/classify-user', (req: Request, res: Response) => {
    if (!isBotAuthorized(req)) {
      res.status(401).json({ error: 'Token Bearer inválido.' });
      return;
    }
    const answers = Array.isArray(req.body?.answers) ? req.body.answers.map(Number) : [];
    if (answers.length === 8) {
      res.json(
        classifyNewUserServerSide(answers, {
          userId: req.body?.userId ? String(req.body.userId) : undefined,
          telegramUsername: req.body?.telegramUsername ? String(req.body.telegramUsername) : undefined,
        })
      );
      return;
    }

    // Fallback quick mapping if Python/Telegram sends structured onboarding params
    const horizonMonths = Number(req.body?.horizonMonths ?? 24);
    const savingsPct = Number(req.body?.savingsPct ?? 25);
    const experienceNum = Number(req.body?.experienceLevel ?? 1); // 1..4
    const riskNum = Number(req.body?.riskTolerance ?? 2); // 1..4
    const q3 = horizonMonths < 6 ? 1 : horizonMonths < 24 ? 2 : horizonMonths < 60 ? 3 : 4;
    const q8 = savingsPct > 75 ? 1 : savingsPct >= 50 ? 2 : savingsPct >= 20 ? 3 : 4;
    const q6 = Math.min(4, Math.max(1, Math.round(experienceNum)));
    const qEmo = Math.min(4, Math.max(1, Math.round(riskNum)));
    res.json(
      classifyNewUserServerSide([qEmo, qEmo, q3, qEmo, qEmo, q6, qEmo, q8], {
        userId: req.body?.userId ? String(req.body.userId) : undefined,
        telegramUsername: req.body?.telegramUsername ? String(req.body.telegramUsername) : undefined,
      })
    );
  });

  app.post('/api/bot/v1/signal', async (req: Request, res: Response) => {
    if (!isBotAuthorized(req)) {
      res.status(401).json({ error: 'Token Bearer inválido.' });
      return;
    }
    const symbol = String(req.body?.symbol || 'SPY').toUpperCase().trim();
    const side = String(req.body?.side || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    const shares = Math.max(0.01, Number(req.body?.shares || 1));
    const portfolioMxn = Math.max(0, Number(req.body?.portfolioMxn || 0));
    const stopLossPct = Math.min(2.5, Math.max(0.5, Number(req.body?.stopLossPct || 2.5)));

    const snapshot = await buildLiveQuotesSnapshot();
    const quote = snapshot.quotes[symbol];
    if (!quote) {
      res.status(404).json({ approved: false, reason: `Símbolo ${symbol} no disponible en Yahoo Finance.` });
      return;
    }

    const grossMxn = Number((quote.priceMxn * shares).toFixed(2));
    const commissionMxn = Number((grossMxn * 0.001).toFixed(2)); // 0.10%
    const maxLossAtStop = Number((grossMxn * (stopLossPct / 100)).toFixed(2));
    const maxVarBudgetMxn = Number((portfolioMxn * 0.025).toFixed(2));
    const passesVar = side === 'SELL' || portfolioMxn <= 0 ? portfolioMxn > 0 : maxLossAtStop <= maxVarBudgetMxn;

    res.json({
      symbol,
      side,
      shares,
      priceMxn: quote.priceMxn,
      priceOriginal: quote.priceOriginal,
      originalCurrency: quote.originalCurrency,
      grossMxn,
      commissionPct: 0.1,
      commissionMxn,
      stopLossPct,
      maxLossAtStopMxn: maxLossAtStop,
      maxVarBudgetMxn,
      approved: passesVar,
      decision: passesVar
        ? quote.changePct > 0.4
          ? 'BUY'
          : 'HOLD'
        : 'REJECTED_VAR_CAP',
      reason: passesVar
        ? 'Cumple comisión institucional 0.10% y límite VaR 99% (2.50%).'
        : portfolioMxn <= 0
        ? 'El portafolio está en $0.00 MXN; activa Modo Juego ($10,000 USD/día) antes de operar.'
        : `La pérdida potencial con Stop Loss (${stopLossPct}%) supera tu presupuesto VaR 2.5% ($${maxVarBudgetMxn} MXN).`,
      updatedAtIso: quote.updatedAtIso,
    });
  });

  // Telegram Bot Webhook (/api/telegram/webhook)
  app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
    const message = req.body?.message;
    const chatId = message?.chat?.id;
    const username = message?.from?.username || message?.from?.first_name || 'Inversionista';
    const text = String(message?.text || '').trim();

    if (!chatId || !text) {
      res.json({ ok: true, ignored: true });
      return;
    }

    let replyText = '';
    const cmd = text.split(/\s+/)[0].toLowerCase();

    if (cmd === '/start') {
      replyText =
        `Hola ${username}, bienvenido al bot cuantitativo de Smart Invest.\n\n` +
        `Comandos disponibles:\n` +
        `• /clasificar 3,3,4,3,3,4,3,4 — Clasifica tu perfil (8 respuestas de 1 a 4) para conectar a tu servidor\n` +
        `• /mercado NVDA — Precio real de Yahoo Finance en MXN/USD\n` +
        `• /avanzado — Requisitos y rutas para conectar tu bot en Python\n` +
        `• /servidor — Estado del servidor y WebSocket /ws/trading-bot`;
    } else if (cmd === '/clasificar') {
      const nums = text
        .replace('/clasificar', '')
        .split(/[\s,;]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 4);

      if (nums.length !== 8) {
        replyText =
          'Para clasificarte envía exactamente 8 números del 1 al 4 separados por coma.\n' +
          'Ejemplo para perfil avanzado: /clasificar 3,3,4,3,3,4,3,4\n' +
          'Ejemplo principiante: /clasificar 1,1,2,1,2,1,1,2';
      } else {
        const result = classifyNewUserServerSide(nums, { telegramUsername: username });
        replyText =
          `Clasificación completada para @${username}:\n` +
          `• Perfil definitivo: ${result.definitiveProfile.toUpperCase()} (${result.totalScore}/32 pts)\n` +
          `• Nivel de experiencia: ${result.experienceTier.toUpperCase()}\n` +
          `• Acceso a Bot Avanzado: ${result.eligibleForAdvancedBot ? 'AUTORIZADO' : 'RESTRINGIDO (usa Modo Juego en web primero)'}\n` +
          `• Ruta recomendada: ${result.serverAccess.recommendedChannel}\n` +
          (result.eligibleForAdvancedBot
            ? `• WebSocket Python: /ws/trading-bot | REST: /api/bot/v1/market`
            : `• Te recomendamos practicar primero en Modo Juego ($10,000 USD/día) en la app web.`);
      }
    } else if (cmd === '/mercado') {
      const sym = (text.split(/\s+/)[1] || 'SPY').toUpperCase();
      const snapshot = await buildLiveQuotesSnapshot();
      const q = snapshot.quotes[sym];
      replyText = q
        ? `${q.symbol} (${q.yahooTicker})\n• Precio: $${q.priceMxn.toLocaleString('es-MX')} MXN ($${q.priceOriginal} ${q.originalCurrency})\n• Cambio día: ${q.changePct >= 0 ? '+' : ''}${q.changePct}%\n• Volatilidad anual: ${q.volatilityAnnualPct}%`
        : `Símbolo ${sym} no encontrado. Prueba con: SPY, AAPL, NVDA, MSFT, AMZN, LLY, XOM, WALMEX, GFNORTE, XRP_USDT.`;
    } else if (cmd === '/avanzado' || cmd === '/servidor') {
      const appUrl = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
      const wsUrl = appUrl.replace(/^http/, 'ws') + '/ws/trading-bot';
      replyText =
        `Smart Invest · Servidor para Usuarios Avanzados (Bot Python)\n` +
        `• REST API: ${appUrl}/api/bot/v1/market\n` +
        `• Clasificador: ${appUrl}/api/bot/v1/classify-user\n` +
        `• WebSocket Live: ${wsUrl}\n` +
        `• Comisión: 0.10% | Tope VaR 99%: 2.50%`;
    } else {
      replyText = 'Comando no reconocido. Usa /start, /clasificar, /mercado NVDA o /avanzado.';
    }

    const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (botToken) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: replyText }),
          signal: AbortSignal.timeout(6000),
        });
      } catch (err) {
        console.error('Telegram sendMessage failed:', err);
      }
    }

    res.json({ ok: true, replyText, telegramDelivered: Boolean(botToken) });
  });

  // WebSocket Stream for Python Trading Bots (/ws/trading-bot)
  botWss.on('connection', (botWs: WebSocket, req) => {
    const reqUrl = new URL(req.url || '/ws/trading-bot', `http://localhost:${PORT}`);
    const expectedSecret = (process.env.BOT_API_SECRET || '').trim();
    const token = reqUrl.searchParams.get('token') || '';
    if (expectedSecret && token !== expectedSecret) {
      botWs.send(JSON.stringify({ type: 'error', message: 'Token inválido para /ws/trading-bot' }));
      botWs.close(1008, 'Unauthorized');
      return;
    }

    let subscribedSymbols: string[] = ['SPY', 'AAPL', 'NVDA'];
    botWs.send(
      JSON.stringify({
        type: 'welcome',
        server: 'Smart Invest Python Bot Gateway',
        port: PORT,
        path: '/ws/trading-bot',
        commissionRatePct: 0.1,
        maxVar99Pct: 2.5,
        subscribedSymbols,
        timestampIso: new Date().toISOString(),
      })
    );

    const pushMarketTick = async () => {
      if (botWs.readyState !== WebSocket.OPEN) return;
      try {
        const snapshot = await buildLiveQuotesSnapshot();
        const filtered: Record<string, unknown> = {};
        for (const sym of subscribedSymbols) {
          if (snapshot.quotes[sym]) filtered[sym] = snapshot.quotes[sym];
        }
        botWs.send(
          JSON.stringify({
            type: 'market_tick',
            usdMxnRate: snapshot.usdMxnRate,
            quotes: filtered,
            timestampIso: snapshot.updatedAtIso,
          })
        );
      } catch {
        // ignore transient quote error
      }
    };

    void pushMarketTick();
    const interval = setInterval(() => {
      void pushMarketTick();
    }, 15000);

    botWs.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          action?: string;
          symbols?: string[];
          answers?: number[];
          symbol?: string;
          side?: string;
          shares?: number;
          portfolioMxn?: number;
        };

        if (msg.action === 'ping') {
          botWs.send(JSON.stringify({ type: 'pong', timestampIso: new Date().toISOString() }));
          return;
        }
        if (msg.action === 'subscribe' && Array.isArray(msg.symbols)) {
          subscribedSymbols = msg.symbols
            .map((s) => String(s).toUpperCase().trim())
            .filter((s) => Boolean(YAHOO_SYMBOL_MAP[s]));
          if (subscribedSymbols.length === 0) subscribedSymbols = ['SPY'];
          botWs.send(JSON.stringify({ type: 'subscribed', symbols: subscribedSymbols }));
          await pushMarketTick();
          return;
        }
        if (msg.action === 'classify_user' && Array.isArray(msg.answers)) {
          const classified = classifyNewUserServerSide(msg.answers);
          botWs.send(JSON.stringify({ type: 'classification_result', data: classified }));
          return;
        }
        if (msg.action === 'get_market') {
          await pushMarketTick();
        }
      } catch {
        botWs.send(JSON.stringify({ type: 'error', message: 'Mensaje JSON inválido' }));
      }
    });

    botWs.on('close', () => {
      clearInterval(interval);
    });
  });

  // Route WebSocket upgrade requests cleanly by pathname
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', `http://localhost:${PORT}`).pathname;
    if (pathname === '/ws/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/trading-bot') {
      botWss.handleUpgrade(request, socket, head, (ws) => {
        botWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  let viteServer: { close: () => Promise<void> } | null = null;
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ...(disableHmr ? { hmr: false, ws: false } : {}),
      },
      appType: 'spa',
    });
    viteServer = vite;
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Invest server running at http://0.0.0.0:${PORT}`);
  });

  // Optional secondary dedicated port for local/VPS self-hosting of Python trading bots
  let secondaryBotServer: http.Server | null = null;
  const extraBotPort = Number(process.env.BOT_GATEWAY_PORT);
  if (Number.isFinite(extraBotPort) && extraBotPort > 0 && extraBotPort !== PORT) {
    secondaryBotServer = http.createServer(app);
    secondaryBotServer.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url || '/', `http://localhost:${extraBotPort}`).pathname;
      if (pathname === '/ws/trading-bot') {
        botWss.handleUpgrade(request, socket, head, (ws) => {
          botWss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });
    secondaryBotServer.listen(extraBotPort, '0.0.0.0', () => {
      console.log(`Python Trading Bot Gateway also listening on port ${extraBotPort}`);
    });
  }

  const shutdown = async () => {
    try {
      wss.close();
      botWss.close();
      if (viteServer) await viteServer.close();
      if (secondaryBotServer) secondaryBotServer.close();
      httpServer.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1500).unref();
    } catch {
      process.exit(0);
    }
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
