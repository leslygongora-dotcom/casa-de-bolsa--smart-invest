import type { DefinitiveProfileKey } from '../firebase';
import type { RiskLevel } from '../types';

export interface InvestorQuestionOption {
  score: 1 | 2 | 3 | 4;
  label: string;
  helperHint?: string;
}

export interface InvestorQuestion {
  id: number;
  title: string;
  dimension: 'emotional' | 'capacity' | 'knowledge';
  helpConcept: string;
  helpExplanation: string;
  options: InvestorQuestionOption[];
}

export interface ContradictionAlert {
  id: string;
  title: string;
  explanation: string;
  clarificationPrompt: string;
}

export interface InvestorEvaluationResult {
  answers: number[]; // length 8, values 1..4
  totalScore: number; // 8..32
  initialProfileKey: DefinitiveProfileKey;
  definitiveProfileKey: DefinitiveProfileKey;
  mappedEngineRiskLevel: RiskLevel;
  profileDisplayName: string;
  emotionalToleranceScore: number; // 0..100
  emotionalLabel: string;
  financialCapacityScore: number; // 0..100
  capacityLabel: string;
  knowledgeScore: number; // 0..100
  knowledgeLabel: string;
  simpleExplanation: string;
  instrumentsToExplore: string[];
  risksToConsider: string[];
  safetyNotes: string[];
  contradictions: ContradictionAlert[];
  wasCappedBySafetyRule: boolean;
}

export const INVESTOR_QUESTIONS: InvestorQuestion[] = [
  {
    id: 1,
    title: '¿Cuál es tu principal objetivo al invertir?',
    dimension: 'emotional',
    helpConcept: 'Rendimiento y Riesgo',
    helpExplanation:
      'El rendimiento es la ganancia que puede generar tu dinero, mientras que el riesgo es qué tanto puede subir o bajar en el camino. A mayor ganancia potencial, suelen existir mayores altibajos.',
    options: [
      { score: 1, label: 'Proteger mi dinero y evitar pérdidas.' },
      { score: 2, label: 'Obtener rendimientos estables a largo plazo.' },
      { score: 3, label: 'Hacer crecer mi dinero, aceptando algunas pérdidas.' },
      { score: 4, label: 'Buscar rendimientos altos, aunque implique mucho riesgo.' },
    ],
  },
  {
    id: 2,
    title: 'Si inviertes $10,000 y tu inversión pierde 15% en una semana, ¿qué harías?',
    dimension: 'emotional',
    helpConcept: 'Caída temporal (Minusvalía)',
    helpExplanation:
      'Si tus $10,000 MXN bajan 15%, verías $8,500 MXN en pantalla. Esa diferencia solo se vuelve una pérdida definitiva si vendes en ese momento; si la empresa es sólida y esperas, puede recuperarse.',
    options: [
      { score: 1, label: 'Vendería inmediatamente.' },
      { score: 2, label: 'Me preocuparía y probablemente vendería una parte.' },
      { score: 3, label: 'Mantendría mi inversión y esperaría una recuperación.' },
      { score: 4, label: 'Compraría más acciones aprovechando la caída.' },
    ],
  },
  {
    id: 3,
    title: '¿Durante cuánto tiempo podrías mantener tu dinero invertido sin necesitarlo?',
    dimension: 'capacity',
    helpConcept: 'Horizonte de inversión y Liquidez',
    helpExplanation:
      'Es el tiempo que puedes dejar tu dinero trabajando sin usarlo para emergencias o gastos cercanos. Un plazo más largo da tiempo para superar bajadas temporales del mercado.',
    options: [
      { score: 1, label: 'Menos de 6 meses.' },
      { score: 2, label: 'Entre 6 meses y 2 años.' },
      { score: 3, label: 'Entre 2 y 5 años.' },
      { score: 4, label: 'Más de 5 años.' },
    ],
  },
  {
    id: 4,
    title: '¿Qué porcentaje de tu inversión estarías dispuesto a perder temporalmente sin vender?',
    dimension: 'emotional',
    helpConcept: 'Drawdown (Caída máxima temporal)',
    helpExplanation:
      'Representa qué tanto retroceso temporal desde un punto máximo puedes tolerar sin entrar en pánico ni vender tus acciones antes de tiempo.',
    options: [
      { score: 1, label: 'No aceptaría perder dinero.' },
      { score: 2, label: 'Hasta 5%.' },
      { score: 3, label: 'Entre 5% y 15%.' },
      { score: 4, label: 'Más de 15%, si existe potencial de recuperación.' },
    ],
  },
  {
    id: 5,
    title: '¿Qué harías si el mercado presenta una caída generalizada?',
    dimension: 'emotional',
    helpConcept: 'Caída generalizada del mercado',
    helpExplanation:
      'Ocurre cuando la mayoría de las bolsas y empresas bajan al mismo tiempo por noticias económicas o tasas de interés, no necesariamente porque una sola empresa esté quebrando.',
    options: [
      { score: 1, label: 'Retiraría mi dinero.' },
      { score: 2, label: 'Esperaría a que el mercado se estabilice.' },
      { score: 3, label: 'Revisaría mis inversiones y mantendría las que considero sólidas.' },
      { score: 4, label: 'Buscaría oportunidades para comprar activos a menor precio.' },
    ],
  },
  {
    id: 6,
    title: '¿Qué tanto conoces sobre inversiones?',
    dimension: 'knowledge',
    helpConcept: 'Volatilidad y Diversificación',
    helpExplanation:
      'La volatilidad es cuánto cambia un precio cada día; la diversificación es repartir tu dinero en distintas empresas y sectores para no depender de una sola.',
    options: [
      { score: 1, label: 'Soy principiante y nunca he invertido.' },
      { score: 2, label: 'Conozco algunos conceptos, pero tengo poca experiencia.' },
      { score: 3, label: 'He invertido y entiendo conceptos como rendimiento y volatilidad.' },
      { score: 4, label: 'Tengo experiencia analizando acciones, riesgo y diversificación.' },
    ],
  },
  {
    id: 7,
    title: '¿Qué tipo de rendimiento preferirías?',
    dimension: 'emotional',
    helpConcept: 'Incertidumbre vs. Rendimiento esperado',
    helpExplanation:
      'Instrumentos tranquilos pagan rendimientos previsibles pero moderados; las acciones pueden crecer mucho más, pero con meses buenos y meses negativos.',
    options: [
      { score: 1, label: 'Un rendimiento bajo, pero con la menor incertidumbre posible.' },
      { score: 2, label: 'Un rendimiento moderado con fluctuaciones pequeñas.' },
      { score: 3, label: 'Un rendimiento mayor, aunque haya fluctuaciones importantes.' },
      { score: 4, label: 'Un rendimiento potencialmente alto, aunque pueda sufrir pérdidas fuertes.' },
    ],
  },
  {
    id: 8,
    title: '¿Qué proporción de tus ahorros representa el dinero que deseas invertir?',
    dimension: 'capacity',
    helpConcept: 'Capacidad financiera',
    helpExplanation:
      'Invertir casi todo tu ahorro total reduce tu margen de maniobra ante imprevistos médicos o laborales. Nunca conviene exponer a alto riesgo el dinero que necesitas para vivir tranquilo.',
    options: [
      { score: 1, label: 'Más del 75%.' },
      { score: 2, label: 'Entre 50% y 75%.' },
      { score: 3, label: 'Entre 20% y 49%.' },
      { score: 4, label: 'Menos del 20%.' },
    ],
  },
];

const PROFILE_RANK: Record<DefinitiveProfileKey, number> = {
  conservador: 1,
  moderado: 2,
  crecimiento: 3,
  agresivo: 4,
};

function minProfile(a: DefinitiveProfileKey, b: DefinitiveProfileKey): DefinitiveProfileKey {
  return PROFILE_RANK[a] <= PROFILE_RANK[b] ? a : b;
}

export function classifyInitialScore(totalScore: number): DefinitiveProfileKey {
  if (totalScore <= 14) return 'conservador';
  if (totalScore <= 21) return 'moderado';
  if (totalScore <= 27) return 'crecimiento';
  return 'agresivo';
}

export function mapToEngineRiskLevel(key: DefinitiveProfileKey): RiskLevel {
  if (key === 'conservador') return 'conservador';
  if (key === 'agresivo') return 'agresivo';
  return 'moderado';
}

const PROFILE_CONTENT: Record<
  DefinitiveProfileKey,
  {
    displayName: string;
    simpleExplanation: string;
    instrumentsToExplore: string[];
    risksToConsider: string[];
  }
> = {
  conservador: {
    displayName: 'Conservador',
    simpleExplanation:
      'Tu prioridad es cuidar tu patrimonio y evitar sobresaltos fuertes. Prefieres estabilidad y seguridad antes que buscar ganancias rápidas con riesgo elevado.',
    instrumentsToExplore: [
      'ETFs amplios y defensivos de baja volatilidad (como el S&P 500 en proporción pequeña y gradual)',
      'Empresas consolidadas de consumo básico y dividendos constantes (ej. Wal-Mart de México)',
      'Combinar siempre con reserva líquida o instrumentos de renta fija (CETES) fuera de renta variable',
    ],
    risksToConsider: [
      'Evita acciones individuales altamente volátiles o criptoactivos que puedan caer más de 3%–5% en un solo día.',
      'Mantén activo tu límite Stop Loss y no comprometas dinero que necesites en el corto plazo.',
      'La inflación puede reducir el poder de compra si dejas todo sin invertir a largo plazo.',
    ],
  },
  moderado: {
    displayName: 'Moderado',
    simpleExplanation:
      'Buscas un equilibrio saludable entre hacer crecer tu dinero poco a poco y protegerlo de caídas bruscas. Aceptas variaciones moderadas si el fundamento es sólido.',
    instrumentsToExplore: [
      'ETFs diversificados que agrupan cientos de empresas (SPY) como núcleo principal del portafolio',
      'Empresas líderes globales con flujo de caja estable (Microsoft, Apple, Banorte, Eli Lilly)',
      'Cartera balanceada en distintos sectores para reducir concentración',
    ],
    risksToConsider: [
      'Una sola acción tecnológica puede oscilar fuerte; evita concentrar más del 25%–30% en un mismo sector.',
      'Respeta tu horizonte de inversión para no vender en medio de una corrección pasajera.',
      'Verifica siempre el semáforo de compatibilidad (ISS) antes de seguir una señal técnica BUY.',
    ],
  },
  crecimiento: {
    displayName: 'Crecimiento',
    simpleExplanation:
      'Tienes capacidad financiera y horizonte suficiente para buscar crecimiento superior al promedio, entendiendo que en el camino habrá retrocesos temporales.',
    instrumentsToExplore: [
      'Combinación de ETFs líderes (SPY) con acciones de alto crecimiento (NVIDIA, Amazon, Microsoft, Eli Lilly)',
      'Empresas tecnológicas e innovación con ventaja competitiva comprobada',
      'Rebalanceo periódico por sectores para controlar el Máximo Drawdown',
    ],
    risksToConsider: [
      'Mayor exposición a Beta superior a 1.0: cuando el mercado cae, estas empresas pueden bajar más rápido.',
      'Mantener disciplina con el Stop Loss y evitar compras impulsivas tras subidas verticales.',
      'Vigilar el CVaR (pérdida en escenarios extremos) para dimensionar el tamaño de cada posición.',
    ],
  },
  agresivo: {
    displayName: 'Agresivo',
    simpleExplanation:
      'Cuentas con horizonte amplio, solidez financiera y alta tolerancia a la volatilidad. Buscas maximizar el crecimiento a largo plazo asumiendo fluctuaciones importantes.',
    instrumentsToExplore: [
      'Acciones de alto crecimiento e innovación (NVIDIA, Amazon, Eli Lilly)',
      'Exposición selectiva y acotada a activos digitales o alta Beta (ej. XRP/USDT en fracción controlada)',
      'Estrategias cuantitativas diversificadas complementadas con opciones de cobertura',
    ],
    risksToConsider: [
      'Drawdowns severos (-15% a -35% en activos muy volátiles) pueden tardar meses en recuperarse.',
      'Incluso con perfil agresivo, nunca concentres todo tu capital en una sola posición sin gestión de riesgo.',
      'Monitorea tu VaR y CVaR histórico antes de aumentar apalancamiento o tamaño de orden.',
    ],
  },
};

export function evaluateInvestorProfile(rawAnswers: number[]): InvestorEvaluationResult {
  const answers = rawAnswers.slice(0, 8).map((a) => Math.min(4, Math.max(1, Math.round(Number(a) || 1))));
  while (answers.length < 8) answers.push(1);

  const [q1, q2, q3, q4, q5, q6, q7, q8] = answers;

  const totalScore = answers.reduce((sum, v) => sum + v, 0);
  const initialProfileKey = classifyInitialScore(totalScore);

  // Dimension 1: Tolerancia emocional al riesgo (Q1, Q2, Q4, Q5, Q7) => 5..20 -> 0..100
  const emotionalRaw = q1 + q2 + q4 + q5 + q7;
  const emotionalToleranceScore = Number((((emotionalRaw - 5) / 15) * 100).toFixed(1));

  // Dimension 2: Capacidad financiera (Q3 horizonte + Q8 % ahorros) => 2..8 -> 0..100
  const capacityRaw = q3 + q8;
  const financialCapacityScore = Number((((capacityRaw - 2) / 6) * 100).toFixed(1));

  // Dimension 3: Experiencia y conocimiento (Q6) => 1..4 -> 0..100
  const knowledgeScore = Number((((q6 - 1) / 3) * 100).toFixed(1));

  let definitiveProfileKey: DefinitiveProfileKey = initialProfileKey;
  const safetyNotes: string[] = [];
  const contradictions: ContradictionAlert[] = [];

  // Regla de seguridad 1: Horizonte menor a 6 meses -> nunca agresivo ni crecimiento ni moderado
  if (q3 === 1) {
    definitiveProfileKey = minProfile(definitiveProfileKey, 'conservador');
    safetyNotes.push(
      'Regla de liquidez (< 6 meses): Al necesitar el dinero en menos de 6 meses, tu capacidad financiera limita el perfil a Conservador para evitar vender con pérdidas forzadas.'
    );
  } else if (q3 === 2) {
    definitiveProfileKey = minProfile(definitiveProfileKey, 'moderado');
    safetyNotes.push(
      'Regla de horizonte (6 meses a 2 años): En plazos menores a 2 años se limita el perfil máximo a Moderado para proteger tu capital.'
    );
  }

  // Regla de seguridad 2: Proporción alta de ahorros (Q8)
  if (q8 === 1) {
    definitiveProfileKey = minProfile(definitiveProfileKey, 'conservador');
    safetyNotes.push(
      'Regla patrimonial (> 75% de ahorros): Invertir más del 75% de tus ahorros totales reduce tu margen de seguridad; se ajusta tu perfil a Conservador.'
    );
  } else if (q8 === 2) {
    definitiveProfileKey = minProfile(definitiveProfileKey, 'moderado');
    safetyNotes.push(
      'Regla patrimonial (50% a 75% de ahorros): Por comprometer más de la mitad de tus ahorros, se acota el perfil máximo a Moderado.'
    );
  }

  // Regla de seguridad 3: Principiante absoluto nunca debe recibir perfil Agresivo de inmediato
  if (q6 === 1 && definitiveProfileKey === 'agresivo') {
    definitiveProfileKey = 'crecimiento';
    safetyNotes.push(
      'Protección para principiantes: Como es tu primera experiencia invirtiendo, moderamos el perfil inicial a Crecimiento para que avances gradualmente.'
    );
  }

  // Detección de contradicciones entre respuestas
  if ((q1 >= 3 || q7 >= 3) && (q2 === 1 || q4 === 1)) {
    contradictions.push({
      id: 'contradiction-gain-vs-loss',
      title: 'Contradicción detectada: Buscas rendimiento alto pero no toleras caídas',
      explanation:
        'Indicaste buscar rendimientos crecientes o altos (Pregunta 1 o 7), pero también señalaste que venderías de inmediato ante una baja del 15% o que no aceptarías pérdidas temporales (Pregunta 2 o 4).',
      clarificationPrompt:
        'Para proteger tu tranquilidad, ajustamos tu nivel de riesgo hacia un rango prudente. Te recomendamos revisar las preguntas 2, 4 y 7 si deseas aclarar tu postura.',
    });
    definitiveProfileKey = minProfile(definitiveProfileKey, 'moderado');
    safetyNotes.push(
      'Ajuste por contradicción emocional: Se aplicó un perfil prudente al detectar deseo de rendimientos altos junto con baja tolerancia a caídas temporales.'
    );
  }

  if ((q1 === 4 || q2 === 4 || q7 === 4) && (q3 === 1 || q8 === 1)) {
    contradictions.push({
      id: 'contradiction-tolerance-vs-capacity',
      title: 'Contradicción entre tolerancia emocional y capacidad financiera',
      explanation:
        'Aunque emocionalmente aceptarías volatilidad alta, necesitas el dinero pronto o estás comprometiendo casi todos tus ahorros.',
      clarificationPrompt:
        'La capacidad financiera siempre tiene prioridad sobre la emoción: si el mercado cae justo cuando necesites el dinero, tendrías que asumir pérdidas reales.',
    });
  }

  if (q6 === 1 && q2 === 4 && q5 === 4) {
    contradictions.push({
      id: 'contradiction-beginner-aggressive',
      title: 'Aclaración sugerida: Primera vez invirtiendo con reacción muy agresiva',
      explanation:
        'Señalaste que nunca has invertido, pero comprarías agresivamente durante caídas fuertes. En la práctica, ver dinero real caer por primera vez puede generar estrés inesperado.',
      clarificationPrompt:
        'Te sugerimos comenzar con montos pequeños y observar la compatibilidad ISS antes de aumentar exposición.',
    });
  }

  const emotionalLabel =
    emotionalToleranceScore >= 75
      ? 'Alta tolerancia a fluctuaciones'
      : emotionalToleranceScore >= 45
        ? 'Tolerancia equilibrada'
        : 'Baja tolerancia (prioriza calma)';

  const capacityLabel =
    financialCapacityScore >= 70
      ? 'Capacidad financiera sólida'
      : financialCapacityScore >= 40
        ? 'Capacidad financiera moderada'
        : 'Capacidad financiera limitada (proteger liquidez)';

  const knowledgeLabel =
    knowledgeScore >= 70
      ? 'Experiencia avanzada'
      : knowledgeScore >= 35
        ? 'Conocimiento básico / intermedio'
        : 'Principiante (lenguaje guiado)';

  const content = PROFILE_CONTENT[definitiveProfileKey];

  return {
    answers,
    totalScore,
    initialProfileKey,
    definitiveProfileKey,
    mappedEngineRiskLevel: mapToEngineRiskLevel(definitiveProfileKey),
    profileDisplayName: content.displayName,
    emotionalToleranceScore,
    emotionalLabel,
    financialCapacityScore,
    capacityLabel,
    knowledgeScore,
    knowledgeLabel,
    simpleExplanation: content.simpleExplanation,
    instrumentsToExplore: content.instrumentsToExplore,
    risksToConsider: content.risksToConsider,
    safetyNotes,
    contradictions,
    wasCappedBySafetyRule: definitiveProfileKey !== initialProfileKey,
  };
}
