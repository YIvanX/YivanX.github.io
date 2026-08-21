/**
 * Pruebas de la parte pura de js/nube.js: la conversión entre el documento del
 * viaje y la fila de la base de datos.
 *
 *   node --test herramientas/nube.test.mjs
 *
 * Lo que va por red no se prueba aquí — eso lo cubre el recorrido en navegador
 * contra el proyecto de verdad. Lo que sí se prueba es lo que puede corromper
 * datos en silencio: que el documento entre y salga sin perder nada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// El módulo lee `location` y `localStorage` al usarse, pero no al importarse.
// Se apuntalan igualmente para que importar no dependa de un navegador.
globalThis.localStorage ??= {
  _d: new Map(),
  getItem(k) { return this._d.get(k) ?? null; },
  setItem(k, v) { this._d.set(k, String(v)); },
  removeItem(k) { this._d.delete(k); },
};
globalThis.location ??= { origin: 'https://ejemplo', pathname: '/', hash: '', search: '' };

const { aFila, aDocumento, leerCuerpo } = await import('../js/nube.js');

const viaje = () => ({
  id: 'leon-2026-08',
  titulo: 'León',
  subtitulo: 'Seis días',
  estado: 'planificado',
  fechas: { inicio: '2026-08-29', fin: '2026-09-03' },
  lugares: [{ id: 'x', nombre: 'X', categoria: 'pueblo', coords: [42.5, -5.5], resumen: 'r' }],
  dias: [{ fecha: '2026-08-29', titulo: 'D', bloques: [{ inicio: '10:00', lugar: 'x' }] }],
});

test('aFila extrae las columnas de listado y guarda el documento entero', () => {
  const f = aFila(viaje(), 'usuario-1');
  assert.equal(f.id, 'leon-2026-08');
  assert.equal(f.propietario, 'usuario-1');
  assert.equal(f.titulo, 'León');
  assert.equal(f.fecha_inicio, '2026-08-29');
  assert.equal(f.fecha_fin, '2026-09-03');
  assert.equal(f.estado, 'planificado');
  assert.deepEqual(f.datos, viaje(), 'el documento debe ir completo, no recortado');
});

test('un subtítulo ausente va como null y no como cadena vacía', () => {
  // Postgres distingue: '' es un subtítulo vacío, null es que no hay.
  const v = viaje();
  delete v.subtitulo;
  assert.equal(aFila(v, 'u').subtitulo, null);
});

test('sin estado, se guarda como planificado', () => {
  const v = viaje();
  delete v.estado;
  assert.equal(aFila(v, 'u').estado, 'planificado');
});

test('aFila rechaza lo que la base de datos rechazaría, pero antes', () => {
  assert.throws(() => aFila({ titulo: 'X', fechas: { inicio: '2026-01-01', fin: '2026-01-02' } }, 'u'), /id/);
  assert.throws(() => aFila({ id: 'x', titulo: 'X' }, 'u'), /fechas/);
  assert.throws(() => aFila({ id: 'x', titulo: 'X', fechas: { inicio: '2026-01-01' } }, 'u'), /fechas/);
});

test('el viaje sobrevive a la ida y la vuelta sin perder nada', () => {
  const original = viaje();
  const fila = { ...aFila(original, 'u'), version: 3, actualizado_en: '2026-08-20T10:00:00Z' };
  const vuelta = aDocumento(fila);

  assert.equal(vuelta.versionNube, 3);
  assert.equal(vuelta.actualizadoEn, '2026-08-20T10:00:00Z');

  // Quitando lo que añade la nube, tiene que ser exactamente el mismo documento.
  const { versionNube, actualizadoEn, ...limpio } = vuelta;
  assert.deepEqual(limpio, original);
});

test('aDocumento con nada devuelve nada, no revienta', () => {
  assert.equal(aDocumento(null), null);
  assert.equal(aDocumento(undefined), null);
});

test('el id de la fila manda sobre el del documento', () => {
  // Si alguna vez no coinciden, la verdad es la clave primaria de la tabla.
  const d = aDocumento({ id: 'el-bueno', version: 1, datos: { id: 'el-viejo', titulo: 'X' } });
  assert.equal(d.id, 'el-bueno');
});

// --- El cuerpo de la respuesta -------------------------------------------
// PostgREST no siempre contesta con JSON, y esto no es un caso raro: es lo que
// devuelven `guardarEstado` e `invitar` cada vez que funcionan. Mirar solo el
// 204 hacía que una escritura correcta reventara al parsear un cuerpo vacío, y
// el error salía **después** de que el dato ya estuviera guardado en la nube.

test('un 200 con el cuerpo vacío no revienta: es lo que contesta un upsert con return=minimal', async () => {
  assert.equal(await leerCuerpo(new Response('', { status: 200 })), null);
});

test('un 201 con el cuerpo vacío tampoco', async () => {
  assert.equal(await leerCuerpo(new Response('', { status: 201 })), null);
});

test('un 204 sigue devolviendo nada', async () => {
  assert.equal(await leerCuerpo(new Response(null, { status: 204 })), null);
});

test('y cuando sí trae JSON, se devuelve parseado', async () => {
  assert.deepEqual(await leerCuerpo(new Response('[{"id":"x"}]', { status: 200 })), [{ id: 'x' }]);
});
