import { handleEquipoSuscripcionSincronizar } from '../../../server/handlers/equipo-suscripciones.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';
import { crearMp } from '../../../server/reservas/mercadopago.mjs';

// makeEquipoDeps ya trae db, acceso, correo y Google; solo le falta Mercado Pago.
export const onRequest = (ctx) => handleEquipoSuscripcionSincronizar(ctx.request, ctx.env, { ...makeEquipoDeps(ctx.env), mp: crearMp(ctx.env) });
