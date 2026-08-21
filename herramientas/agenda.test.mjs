/**
 * Pruebas de js/agenda.js — el reparto de avisos, listas y tramos.
 *
 *   node --test herramientas/agenda.test.mjs
 *
 * Se prueba entero por lo mismo que la capa del itinerario: un fallo aquí no da
 * error, **esconde** un aviso o una lista. Y lo que se esconde no se echa de
 * menos hasta que estás delante de la taquilla cerrada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  avisosDelDia, avisosDelViaje, avisosDeMomento,
  listasDe, progresoDeListas,
  tramosDelDia, tramosDelViaje, resumenDeTramos,
  hayPreViaje, hayPostViaje, diaTieneAtencion,
} from '../js/agenda.js';

/** Viaje mínimo con la misma forma que uno normalizado por datos.js. */
const viaje = () => ({
  id: 'prueba',
  estadoReal: 'planificado',
  fechas: { inicio: '2026-05-01', fin: '2026-05-02' },
  avisos: [
    { titulo: 'General', texto: 'sin fecha ni momento' },
    { titulo: 'Del día 1', texto: 'x', dias: ['2026-05-01'] },
    { titulo: 'De los dos', texto: 'x', dias: ['2026-05-01', '2026-05-02'] },
    { titulo: 'Reservar antes', texto: 'x', momento: 'pre', dias: ['2026-05-02'] },
  ],
  listas: [
    { titulo: 'Del viaje', items: [{ id: 'a', texto: 'A' }] },
    { titulo: 'Antes de salir', momento: 'pre', items: [{ id: 'b', texto: 'B' }, { id: 'c', texto: 'C' }] },
    { titulo: 'Del día 2', dias: ['2026-05-02'], items: [{ id: 'd', texto: 'D' }] },
  ],
  transporte: [{ tramo: 'Coche de alquiler', modo: 'coche' }],
  dias: [
    {
      fecha: '2026-05-01',
      bloques: [
        { tipo: 'visita', lugar: { id: 'museo' } },
        {
          tipo: 'traslado', inicio: '11:00', fin: '11:45', modo: 'a-pie',
          lugarDesde: { id: 'museo', nombre: 'Museo' },
          lugarHasta: { id: 'plaza', nombre: 'Plaza' },
          detalle: '700 m',
        },
        {
          tipo: 'traslado', inicio: '18:00', fin: '19:15', modo: 'coche',
          lugarDesde: { id: 'plaza', nombre: 'Plaza' },
          lugarHasta: { id: 'casa', nombre: 'Casa' },
        },
      ],
    },
    { fecha: '2026-05-02', bloques: [{ tipo: 'visita', lugar: { id: 'plaza' } }] },
  ],
});

// --- Avisos ---------------------------------------------------------------

test('un aviso sin dias ni momento es del viaje', () => {
  const titulos = avisosDelViaje(viaje()).map((a) => a.titulo);
  assert.deepEqual(titulos, ['General']);
});

test('un aviso con dias sale en cada uno de sus días', () => {
  assert.deepEqual(avisosDelDia(viaje(), '2026-05-01').map((a) => a.titulo), ['Del día 1', 'De los dos']);
  assert.deepEqual(avisosDelDia(viaje(), '2026-05-02').map((a) => a.titulo), ['De los dos', 'Reservar antes']);
});

test('un aviso con dias NO cae en la portada', () => {
  assert.equal(avisosDelViaje(viaje()).some((a) => a.dias), false);
});

test('un aviso puede ser de preparación y además de un día', () => {
  const pre = avisosDeMomento(viaje(), 'pre').map((a) => a.titulo);
  assert.deepEqual(pre, ['Reservar antes']);
  // El mismo aviso, otra vez, el día que toca.
  assert.ok(avisosDelDia(viaje(), '2026-05-02').some((a) => a.titulo === 'Reservar antes'));
});

test('un día sin avisos declarados devuelve lista vacía, no undefined', () => {
  assert.deepEqual(avisosDelDia(viaje(), '2026-12-31'), []);
  assert.deepEqual(avisosDelDia({}, '2026-05-01'), []);
});

// --- Listas ---------------------------------------------------------------

test('las listas se reparten por ámbito sin solaparse', () => {
  const v = viaje();
  assert.deepEqual(listasDe(v, 'viaje').map((l) => l.titulo), ['Del viaje']);
  assert.deepEqual(listasDe(v, 'pre').map((l) => l.titulo), ['Antes de salir']);
  assert.deepEqual(listasDe(v, 'post'), []);
  assert.deepEqual(listasDe(v, '2026-05-02').map((l) => l.titulo), ['Del día 2']);
  assert.deepEqual(listasDe(v, '2026-05-01'), []);
});

test('el progreso cuenta los items de todas las listas del ámbito', () => {
  assert.deepEqual(progresoDeListas(listasDe(viaje(), 'pre'), { b: '2026-04-01' }), { hechas: 1, total: 2 });
  assert.deepEqual(progresoDeListas([], {}), { hechas: 0, total: 0 });
});

// --- Transporte -----------------------------------------------------------

test('los tramos de un día salen de sus bloques de traslado', () => {
  const tramos = tramosDelDia(viaje().dias[0]);
  assert.equal(tramos.length, 2);
  assert.equal(tramos[0].modo, 'a-pie');
  assert.equal(tramos[0].minutos, 45);
  assert.equal(tramos[0].desde.nombre, 'Museo');
  assert.equal(tramos[0].hasta.nombre, 'Plaza');
  assert.equal(tramos[1].minutos, 75);
});

test('un día sin traslados no tiene tramos', () => {
  assert.deepEqual(tramosDelDia(viaje().dias[1]), []);
  assert.deepEqual(tramosDelDia(undefined), []);
});

test('un traslado sin horas no rompe la duración', () => {
  const tramos = tramosDelDia({ fecha: 'x', bloques: [{ tipo: 'traslado', modo: 'bus' }] });
  assert.equal(tramos[0].minutos, 0);
});

test('los tramos del viaje se agrupan por día y saltan los días sin traslado', () => {
  const grupos = tramosDelViaje(viaje());
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].dia.fecha, '2026-05-01');
  assert.equal(grupos[0].tramos.length, 2);
});

test('el resumen de tramos suma tiempo y no repite modos', () => {
  assert.deepEqual(resumenDeTramos(tramosDelDia(viaje().dias[0])), {
    cuantos: 2, minutos: 120, modos: ['a-pie', 'coche'],
  });
});

// --- Preparativos y vuelta ------------------------------------------------

test('hay preparativos si hay lista pre, aviso pre o contratos de transporte', () => {
  assert.equal(hayPreViaje(viaje()), true);
  assert.equal(hayPreViaje({ listas: [], avisos: [], transporte: [] }), false);
  assert.equal(hayPreViaje({ transporte: [{ tramo: 'Vuelo' }] }), true);
});

test('no hay vuelta si no hay nada de vuelta y el viaje no ha terminado', () => {
  assert.equal(hayPostViaje(viaje()), false);
});

test('hay vuelta con una lista post, o con el viaje completado', () => {
  const conLista = { ...viaje(), listas: [{ titulo: 'Al volver', momento: 'post', items: [] }] };
  assert.equal(hayPostViaje(conLista), true);
  assert.equal(hayPostViaje({ ...viaje(), estadoReal: 'completado' }), true);
});

// --- Punto de atención en la barra de días --------------------------------

test('un día con aviso propio pide atención', () => {
  assert.equal(diaTieneAtencion(viaje(), '2026-05-01', {}), true);
});

test('un día con la lista terminada deja de pedirla', () => {
  const v = viaje();
  assert.equal(diaTieneAtencion(v, '2026-05-02', {}), true);
  // Con el aviso quitado, lo único que quedaba era la lista: al marcarla, se apaga.
  const soloLista = { ...v, avisos: [] };
  assert.equal(diaTieneAtencion(soloLista, '2026-05-02', {}), true);
  assert.equal(diaTieneAtencion(soloLista, '2026-05-02', { d: '2026-05-02' }), false);
});

test('un día sin nada no pide atención', () => {
  assert.equal(diaTieneAtencion(viaje(), '2026-12-31', {}), false);
});
