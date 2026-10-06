/** Calificación A–F a partir de aciertos. Aprueba desde 70% (C). */
export function calificarTutorialQuiz(correctas, total) {
  const t = Math.max(1, Number(total) || 1);
  const c = Math.max(0, Number(correctas) || 0);
  const pct = Math.round((c / t) * 100);
  if (pct >= 90) return { letra: 'A', label: 'Excelente', aprueba: true, pct };
  if (pct >= 80) return { letra: 'B', label: 'Muy bien', aprueba: true, pct };
  if (pct >= 70) return { letra: 'C', label: 'Aprobado', aprueba: true, pct };
  if (pct >= 60) return { letra: 'D', label: 'Regular — repasa', aprueba: false, pct };
  return { letra: 'F', label: 'Reprobado — vuelve a estudiar', aprueba: false, pct };
}
