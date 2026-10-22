// Tipos de evento de los links de agenda (fijos en el MVP, pedido de Alejandro
// del 2026-10-12). El producto de la reserva es `link_<id>`.
export const TIPOS_LINK = {
  c30v: { nombre: 'Control de 30 min', etiqueta: 'Virtual', duracion_min: 30, modalidades: ['video'] },
  c30p: { nombre: 'Control de 30 min', etiqueta: 'Presencial o virtual', duracion_min: 30, modalidades: ['presencial', 'video'] },
  s60: { nombre: 'Sesión de 1 hora', etiqueta: 'Presencial o virtual', duracion_min: 60, modalidades: ['presencial', 'video'] },
};

export const VENCE_DIAS = 7;
export const REACTIVAR_DIAS = 3;
export const MAX_CONSULTAS_DNI = 10; // por link: nadie usa un link para averiguar datos ajenos

export function tipoDeReserva(r) {
  const p = String(r?.producto ?? '');
  return p.startsWith('link_') ? TIPOS_LINK[p.slice(5)] ?? null : null;
}
