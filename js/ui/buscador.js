/**
 * Buscador rápido (Ctrl/Cmd + K).
 *
 * Sin animación de apertura, a propósito. Es una acción de teclado que se
 * repite muchas veces al día: cualquier transición la hace sentir lenta y
 * desconectada de la pulsación. Raycast no anima su apertura, y es lo correcto.
 */

import { html, icono, esc, $, $$ } from './dom.js';
import { CATEGORIAS } from '../datos.js';
import { fechaLarga } from '../horarios.js';

let fondo = null;
let alElegir = () => {};
let resultados = [];
let seleccion = 0;

/** Coincidencia por subsecuencia, insensible a acentos: "medul" encuentra "Las Médulas". */
const plano = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function puntuar(consulta, texto) {
  const c = plano(consulta);
  const t = plano(texto);
  if (!c) return 0;
  const directo = t.indexOf(c);
  if (directo === 0) return 1000;
  if (directo > 0) return 700 - directo;

  let i = 0;
  let puntos = 0;
  for (const letra of c) {
    const j = t.indexOf(letra, i);
    if (j === -1) return -1;
    puntos += j === i ? 6 : 2;
    i = j + 1;
  }
  return puntos;
}

function buscar(viaje, consulta) {
  const candidatos = [
    ...viaje.lugaresUsados.map((l) => ({
      tipo: 'lugar',
      id: l.id,
      titulo: l.nombre,
      sub: l.resumen,
      zona: l.zona,
      icono: (CATEGORIAS[l.categoria] || CATEGORIAS.practico).icono,
      texto: `${l.nombre} ${l.zona || ''} ${l.resumen}`,
    })),
    ...viaje.dias.map((d) => ({
      tipo: 'dia',
      id: d.fecha,
      titulo: d.titulo,
      sub: fechaLarga(d.fecha),
      icono: 'reloj',
      texto: `${d.titulo} ${fechaLarga(d.fecha)} ${d.resumen || ''}`,
    })),
  ];

  if (!consulta.trim()) return candidatos.slice(0, 9);

  return candidatos
    .map((c) => ({ ...c, puntos: puntuar(consulta, c.texto) }))
    .filter((c) => c.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, 12);
}

function pintarLista(lista) {
  const contenedor = $('.buscador__lista', fondo);
  if (!lista.length) {
    contenedor.innerHTML = html`<div class="buscador__vacio">Nada coincide</div>`;
    return;
  }
  contenedor.innerHTML = lista
    .map((r, i) => html`
      <button class="buscador__item" data-i="${i}" data-sel="${String(i === seleccion)}" type="button">
        ${icono(r.icono)}
        <span>
          <span class="titulo-3">${r.titulo}</span>
          <span class="menudo" style="display:block">${r.sub || ''}${r.zona ? ` · ${r.zona}` : ''}</span>
        </span>
      </button>`)
    .join('');
  contenedor.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' });
}

function mover(delta) {
  if (!resultados.length) return;
  seleccion = (seleccion + delta + resultados.length) % resultados.length;
  $$('.buscador__item', fondo).forEach((b, i) => { b.dataset.sel = String(i === seleccion); });
  $('[data-sel="true"]', fondo)?.scrollIntoView({ block: 'nearest' });
}

function elegir(i = seleccion) {
  const r = resultados[i];
  if (!r) return;
  cerrar();
  alElegir(r);
}

export function cerrar() {
  fondo?.remove();
  fondo = null;
}

export const abierto = () => Boolean(fondo);

export function abrir(viaje, alSeleccionar) {
  if (fondo) { cerrar(); return; }
  alElegir = alSeleccionar;
  seleccion = 0;

  fondo = document.createElement('div');
  fondo.className = 'buscador-fondo';
  fondo.innerHTML = html`
    <div class="buscador" role="dialog" aria-modal="true" aria-label="Buscar en el viaje">
      <div class="buscador__campo">
        ${icono('buscar')}
        <input type="search" placeholder="Buscar un lugar o un día…" autocomplete="off" spellcheck="false" aria-label="Buscar">
        <kbd>esc</kbd>
      </div>
      <div class="buscador__lista scroll-y"></div>
    </div>`;
  document.body.appendChild(fondo);

  const campo = $('input', fondo);
  resultados = buscar(viaje, '');
  pintarLista(resultados);
  campo.focus();

  campo.addEventListener('input', () => {
    seleccion = 0;
    resultados = buscar(viaje, campo.value);
    pintarLista(resultados);
  });

  campo.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); mover(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(); }
    else if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
  });

  fondo.addEventListener('click', (e) => {
    if (e.target === fondo) { cerrar(); return; }
    const item = e.target.closest('.buscador__item');
    if (item) elegir(Number(item.dataset.i));
  });

  // Puntero encima = selección. Que el teclado y el ratón peleen por la
  // selección es de los detalles que se notan sin saber por qué.
  fondo.addEventListener('pointermove', (e) => {
    const item = e.target.closest('.buscador__item');
    if (!item) return;
    const i = Number(item.dataset.i);
    if (i === seleccion) return;
    seleccion = i;
    $$('.buscador__item', fondo).forEach((b, k) => { b.dataset.sel = String(k === seleccion); });
  });
}
