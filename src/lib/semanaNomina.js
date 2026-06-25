/** Semana de nómina: sábado a viernes. */
export function periodoSemanaNomina(fecha = new Date()) {
  const d = new Date(fecha);
  const day = d.getDay();
  const daysSinceSat = (day + 1) % 7;
  const inicio = new Date(d);
  inicio.setDate(d.getDate() - daysSinceSat);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 6);
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fin: fin.toISOString().slice(0, 10),
  };
}

export function etiquetaSemanaNomina(inicio, fin) {
  return `${inicio} (sáb) — ${fin} (vie)`;
}
