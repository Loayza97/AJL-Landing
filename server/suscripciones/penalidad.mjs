// Penalidad por cancelar a mitad del paquete (spec 2026-10-27). Se paga con una
// preferencia de pago único cuyo external_reference es «pen-<id de suscripción>».
// Al aprobarse: penalidad pagada y, si la suscripción seguía activa, se cancela.
import * as sus from './repo.mjs';
import { avisarBaja, cancelarEnMp } from './procesar.mjs';
import { avisarFijas } from '../reservas/aviso-equipo.mjs';
import { correoEquipoSuscripcion } from './correos.mjs';

export async function procesarPagoPenalidad(deps, env, pago) {
  const s = await sus.porId(deps.db, String(pago.external_reference).slice(4));
  if (!s || pago.status !== 'approved') return { estado: 'ignorado' };
  if (pago.currency_id !== 'PEN' || Math.round(Number(pago.transaction_amount) * 100) !== s.penalidad_centimos) {
    console.error('penalidad con monto distinto', s.id, pago.id);
    return { estado: 'monto_invalido' };
  }
  if (!(await sus.marcarPenalidadPagada(deps.db, { id: s.id, mpPaymentId: String(pago.id), ahora: deps.ahora() }))) return { estado: 'ya_pagada' };
  if (['pendiente', 'activa'].includes(s.estado)) {
    await cancelarEnMp(deps, env, s);
    const res = await sus.cancelar(deps.db, { id: s.id, motivo: 'paciente_boton', ahora: deps.ahora() });
    if (res.cambio) {
      await avisarBaja(deps, env, s.id, { tipoEquipo: 'cancelada_pagada', penalidad: s.penalidad_centimos, penalidadPagada: true });
    }
    // Si otro camino ganó la baja, ya la avisó como pagada: no se manda nada más.
    return { estado: res.cambio ? 'cancelada' : 'pagada' };
  }
  await avisarFijas(deps, env, correoEquipoSuscripcion('penalidad_pagada', await sus.porId(deps.db, s.id)));
  return { estado: 'pagada' };
}
