import { handleConfirm } from '../../server/handlers/newsletter.mjs';
import { makeDeps } from '../../server/deps.mjs';

export const onRequest = ({ request, env }) => handleConfirm(request, env, makeDeps(env));
