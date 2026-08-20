/**
 * Mensajes efímeros.
 *
 * Con transiciones y no con keyframes: se pueden apilar rápido, y una
 * transición se puede reorientar a mitad mientras que un keyframe reinicia
 * desde cero y da un tirón.
 */

import { html, icono } from './dom.js';

const zona = () => document.getElementById('brindis');
const activos = new Set();
const MAXIMO = 3;

const ICONOS = { info: 'practico', ok: 'check', error: 'aviso' };

/**
 * @param {object} opciones
 * @param {boolean} [opciones.persistente] No se cierra solo. Para un mensaje que
 *   está esperando el final de algo —subir a la nube— y que se resolverá con
 *   `actualizarBrindis`. Un mensaje así **siempre** tiene que acabar actualizado
 *   o cerrado, o se queda en pantalla para siempre.
 */
export function brindis(texto, { tipo = 'info', duracion = 3200, persistente = false } = {}) {
  const contenedor = zona();
  if (!contenedor) return null;

  while (activos.size >= MAXIMO) {
    const viejo = activos.values().next().value;
    cerrar(viejo);
  }

  const el = document.createElement('div');
  el.className = 'brindis';
  el.dataset.estado = 'entrando';
  contenedor.appendChild(el);
  activos.add(el);
  pintarDentro(el, texto, tipo);

  // Un fotograma en el estado inicial para que la transición tenga de dónde salir.
  requestAnimationFrame(() => requestAnimationFrame(() => { el.dataset.estado = 'visible'; }));

  armar(el, persistente ? null : duracion);
  el.addEventListener('pointerdown', () => cerrar(el));
  return el;
}

/**
 * Cambia el texto de un brindis que ya está en pantalla y le pone su cuenta
 * atrás. Es lo que permite que «añadido · subiendo…» se convierta en «en la
 * nube» sin apilar dos mensajes por una sola acción.
 *
 * Si el brindis ya no existe —lo cerró el usuario, o lo desplazó otro— se
 * publica uno nuevo, para que la confirmación no se pierda nunca.
 */
export function actualizarBrindis(el, texto, { tipo = 'ok', duracion = 3200 } = {}) {
  if (!el || !activos.has(el)) return brindis(texto, { tipo, duracion });
  pintarDentro(el, texto, tipo);
  armar(el, duracion);
  return el;
}

function pintarDentro(el, texto, tipo) {
  el.dataset.tipo = tipo;
  el.innerHTML = html`${icono(ICONOS[tipo] || ICONOS.info)}<span>${texto}</span>`;
}

function armar(el, duracion) {
  clearTimeout(el._temporizador);
  el._temporizador = duracion ? setTimeout(() => cerrar(el), duracion) : null;
}

export function cerrar(el) {
  if (!el || !activos.has(el)) return;
  clearTimeout(el._temporizador);
  activos.delete(el);
  el.dataset.estado = 'saliendo';
  el.addEventListener('transitionend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 600);   // por si no llega el transitionend
}
