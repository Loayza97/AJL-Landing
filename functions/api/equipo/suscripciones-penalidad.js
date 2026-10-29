import { handleEquipoSuscripcionPenalidad } from '../../../server/handlers/equipo-suscripciones.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';

export const onRequest = (ctx) => handleEquipoSuscripcionPenalidad(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
