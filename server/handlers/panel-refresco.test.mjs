// El panel /panel/links/ recarga las dos tablas juntas: si solo se recarga la de
// links (al crear uno, por ejemplo), la de Agendados queda vieja y dice «No hay
// citas» aunque el link ya figure como «Agendado».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarRefresco } from '../../src/scripts/panel-refresco.js';

function documentoDePrueba() {
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  return doc;
}

test('refrescar recarga links y luego agendados; sin sesión no pide agendados', async () => {
  const llamadas = [];
  let sesion = true;
  const refrescar = montarRefresco(documentoDePrueba(), {
    links: async () => { llamadas.push('links'); return sesion; },
    agendados: async () => { llamadas.push('agendados'); },
  });
  await refrescar();
  assert.deepEqual(llamadas, ['links', 'agendados']);
  sesion = false;
  await refrescar();
  assert.deepEqual(llamadas, ['links', 'agendados', 'links']);
});

test('al volver a la pestaña (el paciente agendó en otra) se recargan las dos tablas', async () => {
  const doc = documentoDePrueba();
  const llamadas = [];
  montarRefresco(doc, { links: async () => { llamadas.push('links'); return true; }, agendados: async () => { llamadas.push('agendados'); } });
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(llamadas, []);
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(llamadas, ['links', 'agendados']);
});
