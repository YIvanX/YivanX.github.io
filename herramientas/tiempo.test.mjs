/**
 * Pruebas de js/tiempo.js — de dónde sale el punto de cada día y qué se lee de
 * la respuesta de Open-Meteo.
 *
 *   node --test herramientas/tiempo.test.mjs
 *
 * Se prueba lo puro, que es donde están las decisiones: el centroide, la franja
 * de horas, la ventana que sirve la API y el reparto de la respuesta por fecha.
 * La red no se prueba aquí — lo que hay que garantizar es que **cuando no
 * conteste, nada se rompa**, y eso se ve en que `actualizarTiempo` no lanza.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  puntosDelViaje, franjaDelDia, alcanceDeFecha, describirCielo,
  normalizarRespuesta, resumenDelTiempo, esDiaDeAgua, desdeCuando,
  urlDeConsulta, tiempoDelDia, actualizarTiempo, HORIZONTE, RETROSPECTIVA,
} from '../js/tiempo.js';

/** Viaje mínimo con la misma forma que uno normalizado por datos.js. */
const viaje = () => ({
  id: 'prueba',
  base: 'León capital',
  mapa: { centro: [42.66, -6.05] },
  fechas: { inicio: '2026-08-29', fin: '2026-08-31' },
  dias: [
    {
      fecha: '2026-08-29',
      bloques: [{ tipo: 'visita', inicio: '21:00', fin: '23:30' }],
      paradas: [
        { lugar: { id: 'a', zona: 'León capital', coords: [42.60, -5.56] } },
        { lugar: { id: 'b', zona: 'León capital', coords: [42.60, -5.58] } },
      ],
    },
    {
      fecha: '2026-08-30',
      bloques: [
        { tipo: 'visita', inicio: '09:30', fin: '11:15' },
        { tipo: 'visita', inicio: '16:30', fin: '18:00' },
      ],
      paradas: [
        { lugar: { id: 'c', zona: 'Astorga', coords: [42.46, -6.06] } },
        { lugar: { id: 'd', zona: 'Maragatería', coords: [42.48, -6.28] } },
      ],
    },
    // Un día sin plan, de los que rellena datos.js.
    { fecha: '2026-08-31', bloques: [], paradas: [] },
  ],
});

// --- El punto de cada día -------------------------------------------------

test('el punto de un día es el centroide de sus paradas', () => {
  const [uno] = puntosDelViaje(viaje());
  assert.equal(uno.fecha, '2026-08-29');
  assert.equal(uno.lat, 42.6);
  assert.equal(uno.lon, -5.57);
});

test('la etiqueta del día son sus zonas, en orden y sin repetir', () => {
  const puntos = puntosDelViaje(viaje());
  assert.equal(puntos[0].etiqueta, 'León capital');
  assert.equal(puntos[1].etiqueta, 'Astorga y Maragatería');
});

test('con más de dos zonas la etiqueta se corta en vez de crecer', () => {
  const v = viaje();
  v.dias[1].paradas.push({ lugar: { id: 'e', zona: 'El Bierzo', coords: [42.5, -6.7] } });
  assert.equal(puntosDelViaje(v)[1].etiqueta, 'Astorga y 2 zonas más');
});

test('un día sin paradas cae al centro del mapa del viaje, no desaparece', () => {
  const puntos = puntosDelViaje(viaje());
  assert.equal(puntos.length, 3);
  assert.deepEqual(
    [puntos[2].lat, puntos[2].lon, puntos[2].etiqueta],
    [42.66, -6.05, 'León capital'],
  );
});

test('sin paradas y sin centro de mapa, el día no genera punto', () => {
  const v = viaje();
  delete v.mapa;
  assert.equal(puntosDelViaje(v).length, 2);
});

// --- La franja de horas ---------------------------------------------------

test('la franja sale de los bloques, con una hora de margen', () => {
  assert.deepEqual(franjaDelDia({ bloques: [{ inicio: '09:30', fin: '18:00' }] }), [8, 19]);
});

test('un día sin bloques usa una franja de día normal', () => {
  assert.deepEqual(franjaDelDia({ bloques: [] }), [8, 21]);
  assert.deepEqual(franjaDelDia({}), [8, 21]);
});

test('un final que cruza medianoche no arrastra la franja al principio del día', () => {
  // 21:30 → 00:00 daría fin = 0 y una franja de 5 a 23 si se tomara tal cual.
  assert.deepEqual(franjaDelDia({ bloques: [{ inicio: '21:30', fin: '00:00' }] }), [20, 23]);
});

test('la franja nunca se queda en una sola hora', () => {
  const [desde, hasta] = franjaDelDia({ bloques: [{ inicio: '22:40' }] });
  assert.ok(hasta - desde >= 3, `franja demasiado corta: ${desde}-${hasta}`);
});

// --- La ventana que sirve la API ------------------------------------------

test('la ventana de la API se respeta por los dos lados', () => {
  const hoy = '2026-08-28';
  assert.equal(alcanceDeFecha('2026-08-28', hoy).estado, 'prevision');
  assert.equal(alcanceDeFecha('2026-09-13', hoy).estado, 'prevision');   // +16
  assert.equal(alcanceDeFecha('2026-09-14', hoy).estado, 'lejano');      // +17
  assert.equal(alcanceDeFecha('2026-05-28', hoy).estado, 'prevision');   // -92
  assert.equal(alcanceDeFecha('2026-05-27', hoy).estado, 'antiguo');     // -93
});

test('el alcance dice cuántos días faltan, con signo', () => {
  assert.equal(alcanceDeFecha('2026-09-14', '2026-08-28').dias, HORIZONTE + 1);
  assert.equal(alcanceDeFecha('2026-05-27', '2026-08-28').dias, -(RETROSPECTIVA + 1));
});

// --- Códigos WMO ----------------------------------------------------------

test('los códigos se describen en español y ninguno se queda sin respuesta', () => {
  assert.equal(describirCielo(0).texto, 'Despejado');
  assert.equal(describirCielo(3).texto, 'Cubierto');
  assert.equal(describirCielo(45).texto, 'Niebla');
  assert.equal(describirCielo(51).moja, true);
  assert.equal(describirCielo(1234).texto, 'Sin dato');
  assert.equal(describirCielo(undefined).texto, 'Sin dato');
});

// --- La respuesta de Open-Meteo -------------------------------------------

/** Recorte real de la respuesta, con dos localidades y dos fechas. */
const respuesta = () => ([
  {
    latitude: 42.6, longitude: -5.57, elevation: 846.0, timezone: 'Europe/Madrid',
    daily: {
      time: ['2026-08-29', '2026-08-30'],
      weather_code: [3, 2],
      temperature_2m_max: [25.1, 25.0],
      temperature_2m_min: [10.3, 13.8],
      precipitation_probability_max: [3, 0],
      precipitation_sum: [0, 0],
      wind_speed_10m_max: [15.1, 16.3],
      sunrise: ['2026-08-29T07:44', '2026-08-30T07:45'],
      sunset: ['2026-08-29T21:02', '2026-08-30T21:00'],
    },
    hourly: {
      time: ['2026-08-29T19:00', '2026-08-29T21:00', '2026-08-29T23:00', '2026-08-30T10:00'],
      temperature_2m: [23.4, 20.6, 17.9, 18.1],
      precipitation_probability: [0, 3, 5, 0],
      weather_code: [1, 2, 3, 1],
    },
  },
  {
    latitude: 42.47, longitude: -6.17, elevation: 963.0, timezone: 'Europe/Madrid',
    daily: {
      time: ['2026-08-29', '2026-08-30'],
      weather_code: [1, 51],
      temperature_2m_max: [22.1, 21.9],
      temperature_2m_min: [8.1, 13.1],
      precipitation_probability_max: [3, 10],
      precipitation_sum: [0, 0.2],
      wind_speed_10m_max: [13.7, 21.4],
      sunrise: ['2026-08-29T07:46', '2026-08-30T07:47'],
      sunset: ['2026-08-29T21:04', '2026-08-30T21:02'],
    },
    hourly: {
      time: ['2026-08-30T08:00', '2026-08-30T10:00', '2026-08-30T20:00'],
      temperature_2m: [12.2, 18.4, 19.0],
      precipitation_probability: [0, 10, 4],
      weather_code: [2, 51, 2],
    },
  },
]);

const puntosDePrueba = () => ([
  { fecha: '2026-08-29', lat: 42.6, lon: -5.57, etiqueta: 'León capital', franja: [20, 23] },
  { fecha: '2026-08-30', lat: 42.47, lon: -6.17, etiqueta: 'Astorga y Maragatería', franja: [8, 19] },
]);

test('cada localidad aporta solo su propio día', () => {
  const dias = normalizarRespuesta(respuesta(), puntosDePrueba());
  assert.deepEqual(Object.keys(dias), ['2026-08-29', '2026-08-30']);
  // El 30 sale de la segunda localidad, no de la primera, que también lo traía.
  assert.equal(dias['2026-08-30'].max, 21.9);
  assert.equal(dias['2026-08-30'].codigo, 51);
  assert.equal(dias['2026-08-30'].altitud, 963);
  assert.equal(dias['2026-08-30'].etiqueta, 'Astorga y Maragatería');
});

test('se leen los datos del día que se enseñan', () => {
  const t = normalizarRespuesta(respuesta(), puntosDePrueba())['2026-08-29'];
  assert.equal(t.max, 25.1);
  assert.equal(t.min, 10.3);
  assert.equal(t.lluvia, 3);
  assert.equal(t.viento, 15.1);
  assert.equal(t.amanecer, '07:44');
  assert.equal(t.atardecer, '21:02');
  assert.equal(t.altitud, 846);
});

test('las horas se recortan a la franja del día y se redondean', () => {
  const dias = normalizarRespuesta(respuesta(), puntosDePrueba());
  // La franja del 29 es 20-23: entran las 21 y las 23, no las 19.
  assert.deepEqual(dias['2026-08-29'].horas.map((x) => x.h), [21, 23]);
  assert.equal(dias['2026-08-29'].horas[0].t, 21);
  // La del 30 es 8-19: entran las 8 y las 10, no las 20.
  assert.deepEqual(dias['2026-08-30'].horas.map((x) => x.h), [8, 10]);
});

test('una sola localidad devuelve un objeto y no un array, y se lee igual', () => {
  const [primera] = respuesta();
  const dias = normalizarRespuesta(primera, [puntosDePrueba()[0]]);
  assert.equal(dias['2026-08-29'].max, 25.1);
});

test('una localidad sin ese día no inventa una entrada', () => {
  const dias = normalizarRespuesta(respuesta(), [
    { fecha: '2026-09-05', lat: 42.6, lon: -5.57, etiqueta: 'x', franja: [8, 21] },
  ]);
  assert.deepEqual(dias, {});
});

// --- Lecturas para las vistas ---------------------------------------------

test('un día moja por probabilidad o por el propio cielo', () => {
  assert.equal(esDiaDeAgua({ codigo: 3, lluvia: 10 }), false);
  assert.equal(esDiaDeAgua({ codigo: 3, lluvia: 40 }), true);
  // Llovizna con probabilidad baja sigue siendo un día de agua.
  assert.equal(esDiaDeAgua({ codigo: 51, lluvia: 10 }), true);
  assert.equal(esDiaDeAgua(null), false);
});

test('el resumen da los extremos del viaje y cuenta lo que falta', () => {
  const v = viaje();
  const tiempo = { dias: normalizarRespuesta(respuesta(), puntosDePrueba()) };
  const r = resumenDelTiempo(tiempo, v);
  assert.equal(r.cuantos, 2);
  assert.equal(r.faltan, 1);          // el 31 no tiene dato
  assert.equal(r.max, 25.1);
  // La mínima del viaje es la del 29 en León (10,3), no el 8,1 que la segunda
  // localidad trae de ese mismo día: ese día no se está allí.
  assert.equal(r.min, 10.3);
  assert.equal(r.agua, 1);            // el 30, por la llovizna
});

test('sin ningún día con dato, el resumen es null y no un cero engañoso', () => {
  assert.equal(resumenDelTiempo({ dias: {} }, viaje()), null);
  assert.equal(resumenDelTiempo(null, viaje()), null);
});

test('el tiempo de un día ausente es null, no undefined suelto', () => {
  assert.equal(tiempoDelDia(null, '2026-08-29'), null);
  assert.equal(tiempoDelDia({ dias: {} }, '2026-08-29'), null);
});

test('la antigüedad se dice en pasos gruesos', () => {
  const ahora = Date.parse('2026-08-28T12:00:00Z');
  assert.equal(desdeCuando(ahora - 30 * 1000, ahora), 'ahora mismo');
  assert.equal(desdeCuando(ahora - 25 * 60 * 1000, ahora), 'hace 25 min');
  assert.equal(desdeCuando(ahora - 3 * 3600 * 1000, ahora), 'hace 3 h');
  assert.equal(desdeCuando(ahora - 26 * 3600 * 1000, ahora), 'ayer');
  assert.equal(desdeCuando(ahora - 72 * 3600 * 1000, ahora), 'hace 3 días');
  assert.equal(desdeCuando(0, ahora), '');
});

// --- La petición ----------------------------------------------------------

test('la consulta manda todas las coordenadas en una sola petición', () => {
  const url = new URL(urlDeConsulta(puntosDePrueba(), '2026-08-29', '2026-08-30'));
  assert.equal(url.searchParams.get('latitude'), '42.6,42.47');
  assert.equal(url.searchParams.get('longitude'), '-5.57,-6.17');
  assert.equal(url.searchParams.get('start_date'), '2026-08-29');
  assert.equal(url.searchParams.get('end_date'), '2026-08-30');
  assert.equal(url.searchParams.get('timezone'), 'auto');
});

test('sin red, actualizar no lanza y devuelve lo que haya', async () => {
  const antes = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error('sin red'));
  try {
    assert.equal(await actualizarTiempo(viaje()), null);
  } finally {
    globalThis.fetch = antes;
  }
});

test('todos los días fuera de la ventana: no se pide nada', async () => {
  const v = viaje();
  v.dias = [{ fecha: '2030-01-01', bloques: [], paradas: [], }];
  let pedido = false;
  const antes = globalThis.fetch;
  globalThis.fetch = () => { pedido = true; return Promise.reject(new Error('no debería')); };
  try {
    await actualizarTiempo(v);
    assert.equal(pedido, false);
  } finally {
    globalThis.fetch = antes;
  }
});
