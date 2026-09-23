/**
 * Pruebas de la fase de planificación: editar actividades del archivo sin
 * tocarlo, notas añadidas a mano, reordenar por huecos, reservas y gastos.
 *
 *   node --test herramientas/planificacion.test.mjs
 *
 * Lo que se prueba aquí no da error cuando falla: mueve una actividad al día
 * equivocado, deja un «reservado» colgado de una hora que ya no existe, o suma
 * 0,30000000000000004 €. Por eso va en Node y no se confía a mirar la pantalla.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aplicarCapa, capaVacia, claveEstable, fijarCambio, quitarCambio, validarCapa, comoJsonDelViaje,
} from '../js/personalizacion.js';
import { fusionarCapas, contarPendientes, difieren } from '../js/sincronizacion.js';
import {
  estadoDeActividad, reordenarPorHuecos, reservasDelDia, reservasOrdenadas, resumenDeGastos,
  tipoDeBloque, duracionDeBloque, guardadoDe, resumenDelDia,
} from '../js/actividades.js';
import { marcarDesfasados } from '../js/datos.js';

const viaje = () => ({
  id: 'prueba',
  fechas: { inicio: '2026-05-01', fin: '2026-05-02' },
  lugares: [
    { id: 'palacio', nombre: 'Palacio', categoria: 'patrimonio', coords: [40, -3] },
    { id: 'restaurante', nombre: 'Restaurante', categoria: 'comida', coords: [40, -3] },
    { id: 'museo', nombre: 'Museo', categoria: 'patrimonio', coords: [40, -3] },
  ],
  dias: [
    { fecha: '2026-05-01', bloques: [
      { inicio: '09:00', fin: '11:00', lugar: 'palacio' },
      { inicio: '12:00', fin: '13:30', lugar: 'restaurante', nota: 'Pedir el menú' },
      { inicio: '15:00', fin: '17:00', lugar: 'museo' },
    ] },
    { fecha: '2026-05-02', bloques: [] },
  ],
});

// --- Editar una actividad del archivo ----------------------------------------

test('editar la hora mueve la actividad y guarda su clave original', () => {
  const v = viaje();
  const clave = claveEstable('2026-05-01', v.dias[0].bloques[0]);
  const capa = fijarCambio(capaVacia(), clave, { inicio: '16:00', fin: '18:00' }, 't1');
  const dia = aplicarCapa(v, capa).viaje.dias[0];
  const palacio = dia.bloques.find((b) => b.lugar === 'palacio');
  assert.equal(palacio.inicio, '16:00');
  assert.equal(palacio.claveBase, clave, 'sin la clave original, su estado se perdería');
  assert.equal(palacio.movido, true);
  assert.equal(dia.bloques.at(-1).lugar, 'palacio', 'se ordena por la hora nueva');
});

test('lo que no se edita sale idéntico al archivo', () => {
  const v = viaje();
  const clave = claveEstable('2026-05-01', v.dias[0].bloques[0]);
  const dia = aplicarCapa(v, fijarCambio(capaVacia(), clave, { coste: 12 })).viaje.dias[0];
  assert.deepEqual(dia.bloques[1], v.dias[0].bloques[1]);
  assert.equal(dia.bloques[0].coste, 12);
  assert.equal(dia.bloques[0].movido, undefined, 'cambiar el coste no es moverla');
});

test('una actividad se puede mover a otro día, aunque ese día venga antes en la lista', () => {
  const v = viaje();
  // Del día 2 al día 1: se añade una al día 2 del archivo y se mueve al 1.
  v.dias[1].bloques.push({ inicio: '10:00', lugar: 'museo' });
  const clave = claveEstable('2026-05-02', v.dias[1].bloques[0]);
  const r = aplicarCapa(v, fijarCambio(capaVacia(), clave, { fecha: '2026-05-01', inicio: '18:00' })).viaje;
  assert.equal(r.dias[1].bloques.length, 0);
  assert.equal(r.dias[0].bloques.at(-1).inicio, '18:00');
  assert.equal(r.dias[0].bloques.at(-1).claveBase, clave);
});

test('una nota vacía borra la del archivo; null vuelve a la del archivo', () => {
  const v = viaje();
  const clave = claveEstable('2026-05-01', v.dias[0].bloques[1]);
  const sinNota = aplicarCapa(v, fijarCambio(capaVacia(), clave, { nota: '' })).viaje.dias[0].bloques[1];
  assert.equal(sinNota.nota, undefined);
  const capa = fijarCambio(fijarCambio(capaVacia(), clave, { nota: 'Otra' }), clave, { nota: null });
  assert.equal(aplicarCapa(v, capa).viaje.dias[0].bloques[1].nota, 'Pedir el menú');
});

test('no se puede cambiar el lugar de una actividad del archivo', () => {
  assert.throws(() => fijarCambio(capaVacia(), 'k', { lugar: 'otro' }), /No se puede cambiar/);
});

test('quitar un cambio deja la actividad como en el archivo, con rastro para fundir', () => {
  const v = viaje();
  const clave = claveEstable('2026-05-01', v.dias[0].bloques[0]);
  const capa = quitarCambio(fijarCambio(capaVacia(), clave, { inicio: '16:00' }, 't1'), clave, 't2');
  assert.deepEqual(capa.cambios[clave], { t: 't2' });
  assert.equal(aplicarCapa(v, capa).viaje.dias[0].bloques[0].inicio, '09:00');
});

test('el estado sigue colgado de la actividad aunque se le cambie la hora', () => {
  const v = viaje();
  const clave = claveEstable('2026-05-01', v.dias[0].bloques[2]);
  const capa = fijarCambio(capaVacia(), clave, { inicio: '10:00' });
  const museo = aplicarCapa(v, capa).viaje.dias[0].bloques.find((b) => b.lugar === 'museo');
  const bloque = { ...museo, lugar: v.lugares[2], claveActividad: museo.claveBase };
  const guardado = { estados: { [clave]: { estado: 'reservado', t: 'x' } } };
  assert.equal(estadoDeActividad(bloque, guardado), 'reservado');
});

// --- Notas añadidas a mano ------------------------------------------------------

test('una nota añadida es un hito con título y sin lugar', () => {
  const capa = { ...capaVacia(), bloques: [{ id: 'n1', fecha: '2026-05-01', tipo: 'hito', inicio: '14:00', titulo: 'Llamar al hotel', t: 'x' }] };
  assert.deepEqual(validarCapa(capa), []);
  const hito = aplicarCapa(viaje(), capa).viaje.dias[0].bloques.find((b) => b.tipo === 'hito');
  assert.equal(hito.titulo, 'Llamar al hotel');
  assert.equal(hito.lugar, undefined);
  assert.equal(hito.propio, true);
});

test('una nota sin título no pasa la validación', () => {
  const capa = { ...capaVacia(), bloques: [{ id: 'n1', fecha: '2026-05-01', tipo: 'hito', inicio: '14:00' }] };
  assert.ok(validarCapa(capa).some((f) => f.includes('sin título')));
});

test('una actividad añadida lleva sus campos nuevos al día', () => {
  const capa = {
    ...capaVacia(),
    lugares: [{ id: 'bar', nombre: 'Bar', categoria: 'comida', coords: [40, -3] }],
    bloques: [{ id: 'b1', fecha: '2026-05-01', lugar: 'bar', inicio: '20:00', coste: 25, url: 'https://x.es', reserva: { necesaria: true }, tipoActividad: 'restaurante', duracionMin: 90 }],
  };
  const bar = aplicarCapa(viaje(), capa).viaje.dias[0].bloques.at(-1);
  assert.equal(bar.coste, 25);
  assert.equal(bar.url, 'https://x.es');
  assert.equal(bar.duracionMin, 90);
  assert.equal(tipoDeBloque(bar), 'restaurante');
});

test('Copiar como JSON lleva lo editado sin marcas de tiempo y nunca reservas ni gastos', () => {
  const capa = {
    ...fijarCambio(capaVacia(), 'k', { inicio: '10:00' }, 't'),
    reservas: [{ id: 'r1', localizador: 'ABC123', t: 'x' }],
    gastos: [{ id: 'g1', importe: 10, t: 'x' }],
  };
  const json = comoJsonDelViaje(capa);
  assert.deepEqual(json.cambios, { k: { inicio: '10:00' } });
  assert.ok(!JSON.stringify(json).includes('ABC123'), 'un localizador no puede acabar en el repositorio público');
  assert.ok(!('gastos' in json) && !('reservas' in json));
});

// --- Fundir y contar lo editado --------------------------------------------------

test('al fundir cambios gana el más reciente', () => {
  const a = fijarCambio(capaVacia(), 'k', { inicio: '10:00' }, '2026-10-01T10:00:00Z');
  const b = fijarCambio(capaVacia(), 'k', { inicio: '11:00' }, '2026-10-01T12:00:00Z');
  assert.equal(fusionarCapas(a, b).cambios.k.inicio, '11:00');
  assert.equal(fusionarCapas(b, a).cambios.k.inicio, '11:00');
});

test('una actividad añadida y editada en otro móvil: gana la edición más reciente', () => {
  const a = { ...capaVacia(), bloques: [{ id: 'b1', fecha: '2026-05-01', lugar: 'x', inicio: '10:00', t: '1' }] };
  const b = { ...capaVacia(), bloques: [{ id: 'b1', fecha: '2026-05-01', lugar: 'x', inicio: '12:00', t: '2' }] };
  assert.equal(fusionarCapas(a, b).bloques[0].inicio, '12:00');
  assert.equal(fusionarCapas(b, a).bloques[0].inicio, '12:00');
});

test('editar cuenta como cambio sin subir', () => {
  const subida = { ...capaVacia(), bloques: [{ id: 'b1', fecha: '2026-05-01', lugar: 'x', inicio: '10:00', t: '1' }] };
  const local = { ...subida, bloques: [{ ...subida.bloques[0], inicio: '12:00', t: '2' }] };
  assert.equal(contarPendientes(local, subida), 1);
  assert.equal(difieren(local, subida), true);
  const conCambio = fijarCambio(subida, 'k', { coste: 5 });
  assert.equal(contarPendientes(conCambio, subida), 1);
});

// --- Reordenar por huecos --------------------------------------------------------

const actividades = () => [
  { claveActividad: 'palacio', inicio: '09:00', fin: '11:00' },
  { claveActividad: 'restaurante', inicio: '12:00', fin: '13:30' },
  { claveActividad: 'museo', inicio: '15:00', fin: '17:00' },
];

test('reordenar intercambia los huecos: el museo sube al de las 12:00', () => {
  const cambios = reordenarPorHuecos(actividades(), ['palacio', 'museo', 'restaurante']);
  assert.deepEqual(cambios.map((c) => [c.bloque.claveActividad, c.inicio, c.fin]), [
    ['museo', '12:00', '14:00'],
    ['restaurante', '15:00', '16:30'],
  ]);
});

test('el mismo orden no cambia nada', () => {
  assert.deepEqual(reordenarPorHuecos(actividades(), ['palacio', 'restaurante', 'museo']), []);
});

test('un orden que no tiene las mismas actividades se rechaza', () => {
  assert.throws(() => reordenarPorHuecos(actividades(), ['palacio', 'museo']));
  assert.throws(() => reordenarPorHuecos(actividades(), ['palacio', 'museo', 'otro']));
});

test('sin hora no hay hueco que intercambiar', () => {
  const sinHora = [...actividades(), { claveActividad: 'plaza' }];
  assert.throws(() => reordenarPorHuecos(sinHora, ['plaza', 'palacio', 'restaurante', 'museo']), /necesitan hora/);
});

test('tras reordenar, el traslado que ya no une vecinas se marca y no se suma', () => {
  const [palacio, restaurante, museo] = viaje().lugares;
  const bloques = [
    { tipo: 'visita', lugar: palacio, inicio: '09:00', fin: '11:00' },
    { tipo: 'traslado', lugarDesde: palacio, lugarHasta: restaurante, inicio: '11:00', fin: '11:30', modo: 'a-pie', detalle: '2 km' },
    { tipo: 'visita', lugar: museo, inicio: '12:00', fin: '14:00', movido: true },
    { tipo: 'visita', lugar: restaurante, inicio: '15:00', fin: '16:30', movido: true },
  ];
  marcarDesfasados(bloques);
  assert.equal(bloques[1].desfasado, true);
  const r = resumenDelDia({ bloques });
  assert.equal(r.aPie.minutos, 0);
  assert.equal(r.aPie.metros, null);
});

test('un traslado desde el alojamiento al primer sitio encaja aunque no salga de una actividad', () => {
  const [palacio] = viaje().lugares;
  const casa = { id: 'casa' };
  const bloques = [
    { tipo: 'traslado', lugarDesde: casa, lugarHasta: palacio, inicio: '08:30', fin: '09:00', modo: 'a-pie' },
    { tipo: 'visita', lugar: palacio, inicio: '09:00', movido: true },
  ];
  marcarDesfasados(bloques);
  assert.equal(bloques[0].desfasado, false);
});

// --- Reservas ------------------------------------------------------------------------

test('una reserva vinculada marca la actividad como reservada', () => {
  const bloque = { tipo: 'visita', lugar: { id: 'museo' }, claveActividad: 'k' };
  assert.equal(estadoDeActividad(bloque, { reservas: [{ id: 'r', actividad: 'k' }] }), 'reservado');
  assert.equal(estadoDeActividad(bloque, { reservas: [{ id: 'r', actividad: 'k', borrado: true }] }), 'pendiente');
});

test('guardadoDe junta lo personal y lo compartido, sin reservas borradas', () => {
  const g = guardadoDe({ visitados: { a: 'x' } }, { estados: { k: {} }, reservas: [{ id: 1 }, { id: 2, borrado: true }] });
  assert.deepEqual(Object.keys(g.visitados), ['a']);
  assert.equal(g.reservas.length, 1);
});

test('las reservas del día incluyen el hotel que lo cubre', () => {
  const reservas = [
    { id: 'h', tipo: 'hotel', fecha: '2026-10-03', hasta: '2026-10-07' },
    { id: 'v', tipo: 'vuelo', fecha: '2026-10-03', hora: '07:00' },
    { id: 'c', tipo: 'restaurante', fecha: '2026-10-05', hora: '21:00' },
    { id: 'x', tipo: 'otro', fecha: '2026-10-05', borrado: true },
  ];
  assert.deepEqual(reservasDelDia(reservas, '2026-10-05').map((r) => r.id), ['h', 'c']);
  assert.deepEqual(reservasOrdenadas(reservas).map((r) => r.id), ['h', 'v', 'c']);
});

// --- Gastos ----------------------------------------------------------------------------

test('los gastos se suman en céntimos: 0,1 + 0,2 son 0,3', () => {
  const r = resumenDeGastos([
    { id: 1, importe: 0.1, categoria: 'comida', fecha: '2026-10-03' },
    { id: 2, importe: 0.2, categoria: 'comida', fecha: '2026-10-03' },
  ]);
  assert.equal(r.total, 0.3);
});

test('los gastos se reparten por categoría y por día, sin los borrados', () => {
  const gastos = [
    { id: 1, importe: 30, categoria: 'comida', fecha: '2026-10-03' },
    { id: 2, importe: 12.5, categoria: 'transporte', fecha: '2026-10-04' },
    { id: 3, importe: 100, categoria: 'hotel', fecha: '2026-10-04', borrado: true },
    { id: 4, importe: 5, categoria: 'inventada', fecha: '2026-10-04' },
  ];
  const r = resumenDeGastos(gastos);
  assert.equal(r.total, 47.5);
  assert.deepEqual(r.porCategoria, [
    { categoria: 'comida', importe: 30 },
    { categoria: 'transporte', importe: 12.5 },
    { categoria: 'otros', importe: 5 },
  ]);
  assert.deepEqual(r.porDia, { '2026-10-03': 30, '2026-10-04': 17.5 });
  assert.equal(resumenDeGastos(gastos, { fecha: '2026-10-04' }).total, 17.5);
});

// --- Tipos y duración ---------------------------------------------------------------------

test('el tipo se deduce de la categoría cuando no se eligió', () => {
  assert.equal(tipoDeBloque({ lugar: { categoria: 'comida' } }), 'restaurante');
  assert.equal(tipoDeBloque({ lugar: { categoria: 'naturaleza' } }), 'lugar');
  assert.equal(tipoDeBloque({ tipo: 'hito' }), 'nota');
  assert.equal(tipoDeBloque({ tipoActividad: 'vuelo', lugar: { categoria: 'transporte' } }), 'vuelo');
});

test('la duración es la de la actividad si la tiene, y si no la del lugar', () => {
  assert.equal(duracionDeBloque({ duracionMin: 30, lugar: { duracionMin: 90 } }), 30);
  assert.equal(duracionDeBloque({ inicio: '10:00', fin: '12:00', lugar: { duracionMin: 90 } }), 90);
  assert.equal(duracionDeBloque({ propio: true, inicio: '10:00', fin: '12:00', lugar: {} }), 120);
});
