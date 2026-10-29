import { handleOpciones } from '../../../server/handlers/reservas.mjs';

export const onRequest = (ctx) => handleOpciones(ctx.request, ctx.env);
