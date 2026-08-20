/**
 * Tema claro / oscuro / automático.
 *
 * Tres estados, no dos: «auto» sigue al sistema, y es el que trae de fábrica.
 * Los otros dos son una decisión explícita del usuario y ganan sobre el sistema.
 */

import { temaGuardado, guardarTema } from '../estado.js';

const sistema = matchMedia('(prefers-color-scheme: dark)');
const oyentes = new Set();

let preferencia = temaGuardado();   // 'auto' | 'claro' | 'oscuro'

export const esOscuro = () => (preferencia === 'auto' ? sistema.matches : preferencia === 'oscuro');

function aplicar() {
  const raiz = document.documentElement;
  if (preferencia === 'auto') raiz.removeAttribute('data-tema');
  else raiz.dataset.tema = preferencia;

  // El navegador pinta su propia barra: si no se actualiza, en móvil queda una
  // franja del color contrario arriba del todo.
  const color = esOscuro() ? '#141210' : '#FBFAF8';
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', color);

  oyentes.forEach((fn) => fn(esOscuro()));
}

export function alternarTema() {
  preferencia = { auto: 'oscuro', oscuro: 'claro', claro: 'auto' }[preferencia];
  guardarTema(preferencia);
  aplicar();
  return preferencia;
}

export const preferenciaActual = () => preferencia;
export const alCambiarTema = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };

sistema.addEventListener('change', () => { if (preferencia === 'auto') aplicar(); });
aplicar();
