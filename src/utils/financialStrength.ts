import { DeepAnalysisResult, StockAsset } from '../types';

export type StrengthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface FinancialStrengthResult {
  grade: StrengthGrade;
  score: number; // 0 - 100
  label: string;
  beginnerAdvice: string;
  calibratedWithDeepAnalysis: boolean;
  pillars: {
    stability: number; // 0 - 100
    riskAdjustedReturn: number; // 0 - 100
    fundamentals: number; // 0 - 100
    deepAnalysisAlignment: number; // 0 - 100
  };
  colorClasses: {
    badge: string;
    text: string;
    border: string;
    bgSoft: string;
  };
}

export function computeFinancialStrength(
  asset: StockAsset,
  deepAnalysis?: DeepAnalysisResult
): FinancialStrengthResult {
  // 1. Estabilidad (penaliza volatilidad extrema para proteger a principiantes)
  const stabilityRaw = Math.max(15, Math.min(98, 112 - asset.volatilityAnnualPct * 1.55));

  // 2. Relación Rendimiento / Riesgo (Sharpe aproximado vs tasa libre 9.5%)
  const sharpe =
    asset.volatilityAnnualPct > 0
      ? (asset.annualReturnPct - 9.5) / asset.volatilityAnnualPct
      : 0;
  const riskAdjustedRaw = Math.max(20, Math.min(98, 45 + sharpe * 34));

  // 3. Fundamentos y Valuación (P/U sano + dividendo + sentimiento + aiScore)
  let peBonus = 10;
  if (asset.peRatio === null) {
    peBonus = -12; // Activo digital sin utilidades corporativas tradicionales
  } else if (asset.peRatio <= 25) {
    peBonus = 16;
  } else if (asset.peRatio <= 38) {
    peBonus = 8;
  } else {
    peBonus = 0;
  }
  const divBonus = Math.min(14, asset.dividendYieldPct * 3.2);
  const signalBonus = asset.aiSignal === 'BUY' ? 8 : asset.aiSignal === 'HOLD' ? 4 : -4;
  const fundamentalsRaw = Math.max(
    18,
    Math.min(98, asset.aiScore * 0.68 + peBonus + divBonus + signalBonus)
  );

  // 4. Alineación con Análisis Profundo IA (veredicto, razones vs riesgos)
  let deepAlignmentRaw = asset.aiScore * 0.85 + (asset.sentimentBullishPct - 50) * 0.35;
  if (deepAnalysis) {
    const verdict = deepAnalysis.veredicto.toUpperCase();
    let verdictAdjust = 0;
    if (verdict.includes('COMPRA') || verdict.includes('SUGERIDA') || verdict.includes('SOLIDA') || verdict.includes('FUERTE')) {
      verdictAdjust = 10;
    } else if (verdict.includes('MANTENER') || verdict.includes('ESCALONADA')) {
      verdictAdjust = 4;
    } else if (verdict.includes('OBSERVAR') || verdict.includes('ESPERAR')) {
      verdictAdjust = -4;
    } else if (verdict.includes('EVITAR') || verdict.includes('RIESGO') || verdict.includes('VENDER')) {
      verdictAdjust = -15;
    }
    const reasonsCount = deepAnalysis.razones_para_invertir?.length || 0;
    const risksCount = deepAnalysis.riesgos_clave?.length || 0;
    const balanceAdjust = (reasonsCount - risksCount) * 3;
    deepAlignmentRaw = Math.max(20, Math.min(99, deepAlignmentRaw + verdictAdjust + balanceAdjust));
  } else {
    deepAlignmentRaw = Math.max(20, Math.min(95, deepAlignmentRaw));
  }

  const composite = Math.round(
    stabilityRaw * 0.3 +
      riskAdjustedRaw * 0.25 +
      fundamentalsRaw * 0.25 +
      deepAlignmentRaw * 0.2
  );

  let grade: StrengthGrade = 'C';
  let label = 'Fortaleza Moderada';
  let beginnerAdvice =
    'Tiene potencial, pero presenta altibajos. Invierte montos controlados con Stop Loss.';
  let colorClasses = {
    badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/40',
    bgSoft: 'bg-amber-500/10',
  };

  if (composite >= 84) {
    grade = 'A';
    label = 'Fortaleza Excelente';
    beginnerAdvice =
      'Muy sólida y equilibrada. Ideal como base segura para inversionistas principiantes.';
    colorClasses = {
      badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/40',
      text: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-500/40',
      bgSoft: 'bg-emerald-500/10',
    };
  } else if (composite >= 74) {
    grade = 'B';
    label = 'Buena Fortaleza';
    beginnerAdvice =
      'Fundamentos saludables y buen rendimiento histórico con riesgo manejable.';
    colorClasses = {
      badge: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/40',
      text: 'text-indigo-600 dark:text-indigo-400',
      border: 'border-indigo-500/40',
      bgSoft: 'bg-indigo-500/10',
    };
  } else if (composite >= 62) {
    grade = 'C';
    label = 'Fortaleza Moderada';
    beginnerAdvice =
      'Buen potencial de crecimiento, aunque con mayor movimiento diario; entra poco a poco.';
  } else if (composite >= 50) {
    grade = 'D';
    label = 'Fortaleza Débil / Volátil';
    beginnerAdvice =
      'Presenta oscilaciones fuertes. Recomendable solo con montos pequeños y Stop Loss estricto.';
    colorClasses = {
      badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/40',
      text: 'text-orange-600 dark:text-orange-400',
      border: 'border-orange-500/40',
      bgSoft: 'bg-orange-500/10',
    };
  } else {
    grade = 'F';
    label = 'Alto Riesgo / Precaución';
    beginnerAdvice =
      'Volatilidad muy elevada para principiantes. Prioriza activos calificación A o B primero.';
    colorClasses = {
      badge: 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/40',
      text: 'text-rose-600 dark:text-rose-400',
      border: 'border-rose-500/40',
      bgSoft: 'bg-rose-500/10',
    };
  }

  return {
    grade,
    score: composite,
    label,
    beginnerAdvice,
    calibratedWithDeepAnalysis: Boolean(deepAnalysis),
    pillars: {
      stability: Math.round(stabilityRaw),
      riskAdjustedReturn: Math.round(riskAdjustedRaw),
      fundamentals: Math.round(fundamentalsRaw),
      deepAnalysisAlignment: Math.round(deepAlignmentRaw),
    },
    colorClasses,
  };
}
