import { handleLinksReactivar } from '../../../server/handlers/equipo-links.mjs';
import { makeEquipoDeps } from '../../../server/equipo/deps.mjs';

export const onRequest = (ctx) => handleLinksReactivar(ctx.request, ctx.env, makeEquipoDeps(ctx.env));
