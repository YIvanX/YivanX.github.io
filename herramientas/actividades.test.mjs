/**
 * Pruebas de js/actividades.js y de la capa v2 (estados, reservas y gastos).
 *
 *   node --test herramientas/actividades.test.mjs
 *
 * Lo que se prueba aquí decide qué sale como «Ahora», qué entra en
 * «Pendientes» y qué cifras lleva el resumen del día. Un fallo no da error: te
 * manda a un sitio que ya visitaste o te dice que el día son 3 km cuando son 6.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  estadoDeActividad, pasaFiltro, cuentasPorFiltro, distanciaDeTexto, resumenDelDia,
  momentoDelDia, progresoDelViaje, recorridoDelViaje, necesitaReserva,
} from '../js/actividades.js';
import {
  capaVacia, normalizarCapa, fijarEstado, validarCapa, VERSION_CAPA,
} from '../js/personalizacion.js';
import { fusionarCapas, contarPendientes, difieren } from '../js/sincronizacion.js';

// --- Un día como los que deja datos.js ------------------------------------

const lugar = (id, extra = {}) => ({ id, nombre: id, categoria: 'patrimonio', coords: [50, 14], zona: 'Centro', ...extra });

const torre = lugar('torre', { precio: { importe: 150 } });
const strahov = lugar('strahov', { zona: 'Hradčany' });
const iglesia = lugar('iglesia', { precio: { importe: 150 }, zona: 'Malá Strana' });
const cueva = lugar('cueva', { reserva: { necesaria: true }, precio: { importe: 20 } });

const visita = (l, inicio, fin, extra = {}) => ({
  tipo: 'visita', lugar: l, inicio, fin, claveActividad: `2026-10-04|${inicio}|visita|${l.id}`, ...extra,
});
const traslado = (desde, hasta, inicio, fin, modo, detalle = '') => ({
  tipo: 'traslado', lugarDesde: desde, lugarHasta: hasta, inicio, fin, modo, detalle,
});

const dia = () => ({
  fecha: '2026-10-04',
  bloques: [
    visita(torre, '10:20', '11:05'),
    traslado(torre, strahov, '11:05', '11:25', 'a-pie', '800 m por el sendero de la colina'),
    visita(strahov, '11:25', '12:10', { exterior: true }),
    traslado(strahov, iglesia, '12:10', '12:35', 'a-pie', '1,2 km bajando por Nerudova'),
    visita(iglesia, '12:35', '13:25'),
    traslado(iglesia, cueva, '13:25', '14:00', 'tren', 'Tranvía 22'),
    visita(cueva, '14:00', '15:00'),
  ],
});

// --- Estados --------------------------------------------------------------

test('sin nada guardado, una actividad está por hacer', () => {
  assert.equal(estadoDeActividad(dia().bloques[0]), 'pendiente');
});

test('un sitio que pide reserva sale como requiere reserva hasta que alguien la marca', () => {
  const b = dia().bloques[6];
  assert.equal(estadoDeActividad(b), 'requiere-reserva');
  assert.equal(estadoDeActividad(b, { estados: { [b.claveActividad]: { estado: 'reservado', t: 'x' } } }), 'reservado');
});

test('hecho gana a reservado: una vez dentro, la reserva ya cumplió', () => {
  const b = dia().bloques[6];
  const guardado = { visitados: { cueva: 'x' }, estados: { [b.claveActividad]: { estado: 'reservado', t: 'x' } } };
  assert.equal(estadoDeActividad(b, guardado), 'hecho');
});

test('cancelado gana a todo, también a hecho', () => {
  const b = dia().bloques[0];
  const guardado = { visitados: { torre: 'x' }, estados: { [b.claveActividad]: { estado: 'cancelado', t: 'x' } } };
  assert.equal(estadoDeActividad(b, guardado), 'cancelado');
});

test('volver a por hacer es estado null, y cuenta como por hacer', () => {
  const b = dia().bloques[0];
  assert.equal(estadoDeActividad(b, { estados: { [b.claveActividad]: { estado: null, t: 'x' } } }), 'pendiente');
});

test('una actividad añadida puede pedir reserva ella misma', () => {
  assert.equal(necesitaReserva({ lugar: torre, reserva: { necesaria: true } }), true);
  assert.equal(necesitaReserva({ lugar: torre }), false);
});

test('los filtros reparten los estados como dice la pestaña', () => {
  assert.equal(pasaFiltro('requiere-reserva', 'pendientes'), true);
  assert.equal(pasaFiltro('reservado', 'pendientes'), false);
  assert.equal(pasaFiltro('hecho', 'hechas'), true);
  assert.equal(pasaFiltro('cancelado', 'todas'), true);
  assert.equal(pasaFiltro('cancelado', 'pendientes'), false);
});

test('las cuentas por filtro salen del mismo estado que se pinta', () => {
  const c = cuentasPorFiltro(dia(), { visitados: { torre: 'x' } });
  assert.deepEqual(c, { todas: 4, pendientes: 3, reservadas: 0, hechas: 1 });
});

// --- Distancias -------------------------------------------------------------

test('la distancia se lee del texto del traslado, no se calcula', () => {
  assert.equal(distanciaDeTexto('800 m por el sendero'), 800);
  assert.equal(distanciaDeTexto('1,2 km bajando por Nerudova'), 1200);
  assert.equal(distanciaDeTexto('2 km por la orilla, unos 30 minutos'), 2000);
});

test('en metros el punto es de miles', () => {
  assert.equal(distanciaDeTexto('1.500 m de subida'), 1500);
});

test('los minutos no se confunden con metros', () => {
  assert.equal(distanciaDeTexto('20-25 min andando'), null);
  assert.equal(distanciaDeTexto('Metro o tranvía, unos 25-30 minutos'), null);
  assert.equal(distanciaDeTexto(''), null);
  assert.equal(distanciaDeTexto(undefined), null);
});

// --- Resumen del día --------------------------------------------------------

test('el resumen suma lo que el itinerario dice', () => {
  const r = resumenDelDia(dia());
  assert.equal(r.actividades, 4);
  assert.equal(r.desde, 10 * 60 + 20);
  assert.equal(r.hasta, 15 * 60);
  assert.equal(r.aPie.minutos, 45);
  assert.equal(r.aPie.metros, 2000);
  assert.equal(r.desplazamientos.minutos, 80);
  assert.deepEqual(r.desplazamientos.porModo.map((m) => m.modo), ['a-pie', 'tren']);
});

test('con un tramo a pie sin distancia, los metros no se enseñan', () => {
  const d = dia();
  d.bloques[3].detalle = 'bajando por Nerudova';
  assert.equal(resumenDelDia(d).aPie.metros, null);
  assert.equal(resumenDelDia(d).aPie.minutos, 45);
});

test('el coste no cuenta lo exterior ni lo cancelado, y dice cuántos no tienen precio', () => {
  const d = dia();
  const r = resumenDelDia(d);
  assert.equal(r.coste.importe, 320);
  assert.equal(r.coste.conPrecio, 3);
  assert.equal(r.coste.sinPrecio, 0);

  const cancelada = resumenDelDia(d, { estados: { [d.bloques[4].claveActividad]: { estado: 'cancelado', t: 'x' } } });
  assert.equal(cancelada.coste.importe, 170);
  assert.equal(cancelada.actividades, 3);
  assert.equal(cancelada.canceladas, 1);
});

test('las reservas del día se cuentan por estado', () => {
  const d = dia();
  assert.deepEqual(resumenDelDia(d).reservas, { hechas: 0, pendientes: 1 });
  const guardado = { estados: { [d.bloques[6].claveActividad]: { estado: 'reservado', t: 'x' } } };
  assert.deepEqual(resumenDelDia(d, guardado).reservas, { hechas: 1, pendientes: 0 });
});

test('un día vacío da ceros, no revienta', () => {
  const r = resumenDelDia({ fecha: '2026-10-04', bloques: [] });
  assert.equal(r.actividades, 0);
  assert.equal(r.desde, null);
  assert.equal(r.aPie.metros, null);
});

// --- Qué toca ahora -----------------------------------------------------------

const hora = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

test('antes de la primera actividad, el día no ha empezado y lo siguiente es la primera', () => {
  const m = momentoDelDia(dia(), hora('09:00'));
  assert.equal(m.fase, 'antes');
  assert.equal(m.actual, null);
  assert.equal(m.siguiente.lugar.id, 'torre');
});

test('en mitad de una visita, esa es la actual y la siguiente es la próxima', () => {
  const m = momentoDelDia(dia(), hora('10:30'));
  assert.equal(m.fase, 'en-marcha');
  assert.equal(m.actual.lugar.id, 'torre');
  assert.equal(m.siguiente.lugar.id, 'strahov');
  assert.equal(m.llegada.modo, 'a-pie');
});

test('en un traslado, lo actual es el traslado y la llegada es ese mismo tramo', () => {
  const m = momentoDelDia(dia(), hora('12:20'));
  assert.equal(m.actual.tipo, 'traslado');
  assert.equal(m.siguiente.lugar.id, 'iglesia');
  assert.equal(m.llegada, m.actual);
});

test('lo siguiente se salta lo que ya está hecho', () => {
  const m = momentoDelDia(dia(), hora('10:30'), { visitados: { strahov: 'x' } });
  assert.equal(m.siguiente.lugar.id, 'iglesia');
});

test('después de la última, el día está terminado', () => {
  const m = momentoDelDia(dia(), hora('18:00'));
  assert.equal(m.fase, 'terminado');
  assert.equal(m.siguiente, null);
  assert.equal(m.pasadas.length, 4);
});

test('un bloque sin fin dura hasta que empieza el siguiente', () => {
  const d = { fecha: '2026-10-03', bloques: [
    { tipo: 'hito', titulo: 'Llegada', inicio: '20:00' },
    visita(torre, '21:00', '22:00'),
  ] };
  assert.equal(momentoDelDia(d, hora('20:30')).actual.titulo, 'Llegada');
});

test('un día sin nada se dice como tal', () => {
  assert.equal(momentoDelDia({ bloques: [] }, 600).fase, 'sin-plan');
});

// --- El viaje entero ------------------------------------------------------------

test('el progreso del viaje separa hechas, organizadas y por reservar', () => {
  const viaje = { dias: [dia()] };
  assert.deepEqual(progresoDelViaje(viaje), { total: 4, hechas: 0, organizadas: 3, porReservar: 1 });
  assert.deepEqual(progresoDelViaje(viaje, { visitados: { torre: 'x' } }).hechas, 1);
});

test('el recorrido son las zonas en orden, sin repetir y cortado', () => {
  assert.deepEqual(recorridoDelViaje({ dias: [dia()] }, 2), { zonas: ['Centro', 'Hradčany'], mas: 1 });
});

// --- Capa v2 ----------------------------------------------------------------------

test('una capa v1 sale como v2 con los campos nuevos vacíos, sin perder nada', () => {
  const v1 = { version: 1, lugares: [], bloques: [], ocultos: ['a'] };
  const n = normalizarCapa(v1);
  assert.equal(n.version, VERSION_CAPA);
  assert.deepEqual(n.ocultos, ['a']);
  assert.deepEqual(n.estados, {});
  assert.deepEqual(n.reservas, []);
  assert.deepEqual(validarCapa(v1), []);
});

test('normalizar no arregla tipos rotos: eso lo tiene que decir validarCapa', () => {
  const rota = normalizarCapa({ lugares: [], bloques: [], ocultos: [], estados: 'no' });
  assert.equal(rota.estados, 'no');
  assert.ok(validarCapa(rota).some((f) => f.includes('estados')));
});

test('fijarEstado devuelve una capa nueva y deja rastro al volver a por hacer', () => {
  const c0 = capaVacia();
  const c1 = fijarEstado(c0, 'k', 'reservado', '2026-10-01T10:00:00Z');
  assert.deepEqual(c0.estados, {});
  assert.deepEqual(c1.estados.k, { estado: 'reservado', t: '2026-10-01T10:00:00Z' });
  const c2 = fijarEstado(c1, 'k', null, '2026-10-01T11:00:00Z');
  assert.deepEqual(c2.estados.k, { estado: null, t: '2026-10-01T11:00:00Z' });
  assert.deepEqual(validarCapa(c2), []);
});

test('fijarEstado rechaza lo que no es un estado guardable', () => {
  assert.throws(() => fijarEstado(capaVacia(), 'k', 'hecho'));
  assert.throws(() => fijarEstado(capaVacia(), '', 'reservado'));
});

test('al fundir estados gana el cambio más reciente, venga de donde venga', () => {
  const local = fijarEstado(capaVacia(), 'k', 'reservado', '2026-10-01T10:00:00Z');
  const remoto = fijarEstado(capaVacia(), 'k', null, '2026-10-01T12:00:00Z');
  assert.equal(fusionarCapas(local, remoto).estados.k.estado, null);
  assert.equal(fusionarCapas(remoto, local).estados.k.estado, null);
});

test('al fundir reservas se juntan las de los dos y gana la versión más reciente de cada una', () => {
  const a = { ...capaVacia(), reservas: [{ id: 'r1', nombre: 'Hotel', t: '1' }, { id: 'r2', nombre: 'Vuelo', t: '1' }] };
  const b = { ...capaVacia(), reservas: [{ id: 'r1', nombre: 'Hotel Praga', t: '2' }, { id: 'r3', nombre: 'Tren', t: '1' }] };
  const f = fusionarCapas(a, b).reservas;
  assert.equal(f.length, 3);
  assert.equal(f.find((r) => r.id === 'r1').nombre, 'Hotel Praga');
});

test('un estado cambiado cuenta como cambio sin subir, y deja de contar al subirlo', () => {
  const subida = capaVacia();
  const local = fijarEstado(subida, 'k', 'reservado', '2026-10-01T10:00:00Z');
  assert.equal(contarPendientes(local, subida), 1);
  assert.equal(difieren(local, subida), true);
  assert.equal(contarPendientes(local, local), 0);
  assert.equal(difieren(local, structuredClone(local)), false);
});

test('una capa v1 frente a su v2 vacía no tiene nada pendiente', () => {
  const v1 = { version: 1, lugares: [], bloques: [], ocultos: [] };
  assert.equal(contarPendientes(v1, capaVacia()), 0);
  assert.equal(difieren(v1, capaVacia()), false);
});
