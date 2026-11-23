// Pruebas del flujo de /reservar/ en el navegador (src/scripts/reservar.js y
// selector-horas.js) con un DOM falso mínimo, sin dependencias. Cubren los dos
// bugs del pago de la auditoría del 23-nov-2026:
//   1. «Pagar» quedaba desactivado al volver al paso 4 tras una hora vencida (410).
//   2. Un doble toque en una hora mandaba dos «apartar» y retenía dos horas.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Elemento falso: guarda lo que el script le escribe y los listeners que registra.
function elemento(id = '') {
  const listeners = {};
  const hijos = new Map();
  const el = {
    id, textContent: '', innerHTML: '', hidden: false, disabled: false, checked: false, value: '',
    placeholder: '', className: '', inputMode: '', maxLength: 0, dataset: {}, style: {},
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    addEventListener(tipo, fn) { (listeners[tipo] ??= []).push(fn); },
    disparar(tipo, evento) { return Promise.all((listeners[tipo] ?? []).map((fn) => fn(evento))); },
    append() {}, replaceChildren() {}, setAttribute() {}, focus() {}, scrollIntoView() {}, showModal() {}, close() {},
    querySelector(s) { if (!hijos.has(s)) hijos.set(s, elemento(s)); return hijos.get(s); },
    querySelectorAll: () => [],
    closest: () => null,
  };
  return el;
}

// Documento falso: un elemento por selector, creado al vuelo y siempre el mismo.
function documentoFalso(catalogo) {
  const porSelector = new Map();
  const doc = elemento('document');
  const tomar = (s) => { if (!porSelector.has(s)) porSelector.set(s, elemento(s)); return porSelector.get(s); };
  doc.querySelector = (s) => tomar(s);
  doc.querySelectorAll = () => [];
  doc.getElementById = (id) => (id === 'catalogo' ? { textContent: JSON.stringify(catalogo) } : tomar(`#${id}`));
  doc.createElement = () => elemento();
  doc.createDocumentFragment = () => elemento();
  return { doc, tomar };
}

// Un toque en un botón de hora del selector.
const toqueHora = (raiz, inicio = '2026-12-01T15:00:00Z') => {
  const boton = { disabled: false, dataset: { inicio, nutri: 'n1', nombre: 'Nutri' }, classList: { contains: (c) => c === 'sel-hora' } };
  return raiz.disparar('click', { target: { closest: () => boton } });
};

const esperar = () => new Promise((ok) => setTimeout(ok, 0));
const json = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo });
const futuro = () => new Date(Date.now() + 10 * 60000).toISOString();
const reservaApartada = (token) => ({
  token, estado: 'apartada', producto: 'basico', duracion_meses: 1, forma: 'completo',
  titulo: 'Plan básico', etiqueta: 'Lunes 1 de diciembre, 10:00 a. m.', modalidad: 'video',
  monto_centimos: 25000, nutricionista: { nombre: 'Nutri' }, retencion_hasta: futuro(),
});

// Carga reservar.js con un DOM, fetch y almacenamiento falsos. `responder(url, init)` decide cada fetch.
let cargas = 0;
async function cargarReservar({ search, responder }) {
  const { doc, tomar } = documentoFalso({ basico: { mensual: false } });
  const llamadas = [];
  const almacen = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const relojes = [];
  Object.assign(globalThis, {
    document: doc,
    window: Object.assign(elemento('window'), { scrollTo() {} }),
    location: { search, href: `https://prueba.local/reservar/${search}` },
    history: { state: null, replaceState() {} },
    localStorage: almacen(),
    sessionStorage: almacen(),
    matchMedia: () => ({ matches: true }),
    setInterval: (fn) => { relojes.push(fn); return relojes.length; },
    clearInterval: () => {},
    fetch: async (url, init) => { llamadas.push({ url: String(url), init }); return responder(String(url), init); },
  });
  // Cada carga es un módulo nuevo (estado propio); sus dependencias se comparten, no guardan estado.
  await import(`../../src/scripts/reservar.js?carga=${++cargas}`);
  await esperar(); await esperar();
  return { tomar, llamadas };
}

function llenarDatos(tomar) {
  const v = (s, valor) => { tomar(s).value = valor; };
  v('#f-nombres', 'Ana'); v('#f-paterno', 'Pérez'); v('#f-materno', 'Soto');
  v('#f-pais', '51'); v('#f-whatsapp', '987654321'); v('#f-email', 'ana@example.com');
  v('#f-nac-dia', '15'); v('#f-nac-mes', '06'); v('#f-nac-anio', '1990');
  v('#f-tipo-doc', 'dni'); v('#f-doc', '12345678');
  tomar('#f-para-mi').checked = true;
  tomar('#f-acepto').checked = true;
}

test('bug 1: tras una hora vencida (410), al elegir otra hora «Pagar» vuelve a estar activo', async () => {
  const { tomar, llamadas } = await cargarReservar({
    search: '?r=tok-1',
    responder: (url) => {
      if (url.startsWith('/api/reservas/opciones')) return json(200, { suscripciones: false });
      if (url.startsWith('/api/reservas/estado')) return json(200, reservaApartada('tok-1'));
      if (url.startsWith('/api/reservas/pagar')) return json(410, { error: 'Se venció el tiempo para apartar tu hora. Elige otra.' });
      if (url.startsWith('/api/reservas/horas')) return json(200, { dias: [], nutricionistas: [] });
      if (url.startsWith('/api/reservas/apartar')) return json(200, { ...reservaApartada('tok-2'), estado: undefined });
      throw new Error(`fetch inesperado: ${url}`);
    },
  });
  const boton = tomar('#p4-pagar');
  assert.equal(boton.disabled, false, 'al retomar la reserva, «Pagar» empieza activo');

  llenarDatos(tomar);
  await tomar('#p4-form').disparar('submit', { preventDefault() {} });
  assert.equal(tomar('#p3-error').textContent, 'Se venció el tiempo para apartar tu hora. Elige otra.', 'el 410 lleva al paso 3');

  // Elige otra hora en el selector del paso 3: vuelve al paso 4.
  await toqueHora(tomar('#p3-selector'));
  await esperar();
  assert.ok(llamadas.some((l) => l.url.startsWith('/api/reservas/apartar')), 'se apartó la nueva hora');
  assert.equal(boton.disabled, false, '«Pagar» tiene que responder en el paso 4 sin recargar');
});

test('bug 2: un doble toque en una hora manda un solo «apartar»; al terminar, se puede volver a elegir', async () => {
  let soltar;
  const { tomar, llamadas } = await cargarReservar({
    search: '?plan=basico',
    responder: (url) => {
      if (url.startsWith('/api/reservas/opciones')) return json(200, { suscripciones: false });
      if (url.startsWith('/api/reservas/horas')) return json(200, { dias: [], nutricionistas: [] });
      if (url.startsWith('/api/reservas/apartar')) {
        // El primer apartado queda pendiente hasta que la prueba lo suelte (con error: hora tomada).
        return new Promise((ok) => { soltar = () => ok(json(409, { error: 'Esa hora ya no está disponible.' })); });
      }
      throw new Error(`fetch inesperado: ${url}`);
    },
  });
  const apartados = () => llamadas.filter((l) => l.url.startsWith('/api/reservas/apartar')).length;
  const raiz = tomar('#p3-selector');

  toqueHora(raiz);
  toqueHora(raiz);
  await esperar();
  assert.equal(apartados(), 1, 'el segundo toque, con el primero en curso, se ignora');

  soltar();
  await esperar(); await esperar();
  assert.equal(tomar('#p3-error').textContent, 'Esa hora ya no está disponible.');

  toqueHora(raiz);
  await esperar();
  assert.equal(apartados(), 2, 'terminado el primero (con error), otro toque sí aparta');
});

test('selector de horas (también /reservar/reubicar/): ignora toques mientras onElegir está en curso y se suelta con éxito o con error', async () => {
  const { doc } = documentoFalso({});
  Object.assign(globalThis, {
    document: doc,
    fetch: async () => json(200, { dias: [], nutricionistas: [] }),
  });
  const { montarSelector } = await import('../../src/scripts/selector-horas.js');
  const pendientes = [];
  let elegidas = 0;
  const raiz = elemento('raiz');
  montarSelector(raiz, {
    producto: 'basico', duracion: 1,
    onElegir: () => { elegidas += 1; return new Promise((ok, mal) => pendientes.push({ ok, mal })); },
  });

  toqueHora(raiz); toqueHora(raiz); toqueHora(raiz);
  assert.equal(elegidas, 1, 'tres toques seguidos: una sola elección');

  pendientes[0].ok();
  await esperar();
  toqueHora(raiz); toqueHora(raiz);
  assert.equal(elegidas, 2, 'tras terminar con éxito se puede elegir otra vez, de a una');

  // En /reservar/reubicar/ un fallo de red rechaza onElegir: el error sigue saliendo en la consola.
  const errores = [];
  const consola = console.error;
  console.error = (e) => errores.push(e);
  pendientes[1].mal(new Error('sin conexión'));
  await esperar();
  console.error = consola;
  assert.equal(errores[0]?.message, 'sin conexión', 'el error no se pierde');
  toqueHora(raiz);
  assert.equal(elegidas, 3, 'tras un error también se suelta');
  pendientes[2].ok();
});
