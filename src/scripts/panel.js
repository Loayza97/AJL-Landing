// Panel del equipo (/panel/): login, carga inicial y recarga al volver a la
// pestaña. Primero los links (dicen si hay sesión) y después las reservas.
import { montarLogin } from './panel-login.js';
import { cargarLinks } from './panel-links.js';
import { cargarReservas } from './panel-reservas.js';
import { cargarSuscripciones } from './panel-suscripciones.js';
import './panel-links-reserva.js';

const cargarTodo = async () => { if ((await cargarLinks()) !== false) { await cargarReservas(); await cargarSuscripciones(); } };
montarLogin({ onEntrar: cargarTodo });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cargarTodo(); });
cargarTodo();
