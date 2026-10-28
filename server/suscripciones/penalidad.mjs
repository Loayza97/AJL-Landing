// Penalidad por cancelar a mitad del paquete (spec 2026-10-27). Se paga con una
// preferencia de pago único cuyo external_reference es «pen-<id de suscripción>».
// Al aprobarse: penalidad pagada y, si la suscripción seguía activa, se cancela.
import * as sus from './repo.mjs';
import { avisarBaja, cancelarEnMp } from './procesar.mjs';
import { avisarFijas } from '../reservas/aviso-equipo.mjs';
import { correoEquipoSuscripcion } from './correos.mjs';
import { correoEquipoAlerta } from '../reservas/correos.mjs';
import { formatoSoles } from '../../src/data/duraciones.js';

const avisarDevolver = (deps, env, detalle) => avisarFijas(deps, env, correoEquipoAlerta({ asunto: 'Devolver pago de penalidad', detalle }));

export async function procesarPagoPenalidad(deps, env, pago) {
  const s = await sus.porId(deps.db, String(pago.external_reference).slice(4));
  if (!s || pago.status !== 'approved') return { estado: 'ignorado' };
  const monto = `${pago.currency_id} ${pago.transaction_amount}`;
  if (pago.currency_id !== 'PEN' || Math.round(Number(pago.transaction_amount) * 100) !== s.penalidad_centimos) {
    console.error('penalidad con monto distinto', s.id, pago.id);
    await avisarDevolver(deps, env, `${s.nombre}: el pago ${pago.id} de la penalidad (${monto}) no coincide con lo que se le cobró (${formatoSoles(s.penalidad_centimos / 100)}). No se marcó como pagada. Devuélvelo y pídele que pague desde el link de su correo.`);
    return { estado: 'monto_invalido' };
  }
  if (!(await sus.marcarPenalidadPagada(deps.db, { id: s.id, mpPaymentId: String(pago.id), ahora: deps.ahora() }))) {
    // El reintento del mismo pago no alerta; un segundo pago distinto sí (pagó dos veces).
    const actual = await sus.porId(deps.db, s.id);
    if (String(pago.id) !== actual.penalidad_mp_payment_id) {
      await avisarDevolver(deps, env, `${s.nombre}: pagó otra vez la penalidad (pago ${pago.id}, ${monto}), que ya figuraba pagada. Devuelve este pago.`);
    }
    return { estado: 'ya_pagada' };
  }
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
