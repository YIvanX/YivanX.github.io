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

export function brindis(texto, { tipo = 'info', duracion = 3200 } = {}) {
  const contenedor = zona();
  if (!contenedor) return;

  while (activos.size >= MAXIMO) {
    const viejo = activos.values().next().value;
    cerrar(viejo);
  }

  const nombreIcono = { info: 'practico', ok: 'check', error: 'aviso' }[tipo] || 'practico';
  const el = document.createElement('div');
  el.className = 'brindis';
  el.dataset.estado = 'entrando';
  el.innerHTML = html`${icono(nombreIcono)}<span>${texto}</span>`;
  contenedor.appendChild(el);
  activos.add(el);

  // Un fotograma en el estado inicial para que la transición tenga de dónde salir.
  requestAnimationFrame(() => requestAnimationFrame(() => { el.dataset.estado = 'visible'; }));

  const temporizador = setTimeout(() => cerrar(el), duracion);
  el.addEventListener('pointerdown', () => { clearTimeout(temporizador); cerrar(el); });
  return el;
}

function cerrar(el) {
  if (!el || !activos.has(el)) return;
  activos.delete(el);
  el.dataset.estado = 'saliendo';
  el.addEventListener('transitionend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 600);   // por si no llega el transitionend
}
