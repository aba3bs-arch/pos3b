export const EVENTO_TEMA_INTERFAZ = 'pos3b-tema-interfaz';

const LS_TEMA = 'pos3b_tema_interfaz';

export const TEMA_DEFAULT = 'clasico';

/** Carátulas / interfaces disponibles en el POS. */
export const TEMAS_INTERFAZ = [
  {
    id: 'clasico',
    label: 'Clásico 3B',
    desc: 'Dorado, azul y oliva — identidad Las 3B',
    accent: '#3b66b5',
  },
  {
    id: 'nocturno',
    label: 'Nocturno',
    desc: 'Oscuro para turno de noche y menos fatiga visual',
    accent: '#6b9fff',
  },
  {
    id: 'garage',
    label: 'Garage',
    desc: 'Industrial gris y naranja — taller y refacciones',
    accent: '#ea580c',
  },
  {
    id: 'virtual',
    label: 'Virtual',
    desc: 'Violeta moderno — corte virtual y recolección',
    accent: '#7c3aed',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    desc: 'Blanco limpio — máximo contraste y claridad',
    accent: '#2563eb',
  },
  {
    id: 'mostrador',
    label: 'Mostrador',
    desc: 'Rojo y dorado intenso — abarrotes en mostrador',
    accent: '#dc2626',
  },
];

export function temaPorId(id) {
  return TEMAS_INTERFAZ.find((t) => t.id === id) || TEMAS_INTERFAZ[0];
}

export function leerTemaInterfaz() {
  try {
    const raw = localStorage.getItem(LS_TEMA);
    if (raw && TEMAS_INTERFAZ.some((t) => t.id === raw)) return raw;
  } catch {
    /* ignore */
  }
  return TEMA_DEFAULT;
}

export function guardarTemaInterfaz(id) {
  const tema = TEMAS_INTERFAZ.some((t) => t.id === id) ? id : TEMA_DEFAULT;
  localStorage.setItem(LS_TEMA, tema);
  aplicarTemaInterfaz(tema);
  window.dispatchEvent(new CustomEvent(EVENTO_TEMA_INTERFAZ, { detail: tema }));
  return tema;
}

export function aplicarTemaInterfaz(id) {
  const tema = temaPorId(id || leerTemaInterfaz());
  if (typeof document === 'undefined') return tema.id;
  document.documentElement.setAttribute('data-tema', tema.id);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', tema.accent);
  return tema.id;
}
