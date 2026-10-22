import { handleVisita } from '../../../server/handlers/equipo-links.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';

export const onRequest = (ctx) => handleVisita(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
