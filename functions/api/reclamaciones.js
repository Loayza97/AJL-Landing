import { handleReclamaciones } from '../../server/handlers/reclamaciones.mjs';
import { makeDeps } from '../../server/deps.mjs';

export const onRequest = ({ request, env }) => handleReclamaciones(request, env, makeDeps(env));
