/**
 * Pruebas de js/personalizacion.js — la capa de paradas añadidas y ocultadas.
 *
 *   node --test herramientas/personalizacion.test.mjs
 *
 * Se prueba entero porque es lo que decide **qué aparece en el itinerario**. Un
 * fallo aquí no da error: hace desaparecer una parada, o resucita una que
 * habías quitado, y eso se descubre en el sitio.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  capaVacia, claveEstable, idDesdeNombre, categoriaDesdeOsm,
  lugarDesdeBusqueda, aplicarCapa, ocultosDelDia, validarCapa, comoJsonDelViaje,
} from '../js/personalizacion.js';

/** Viaje mínimo pero con la misma forma que uno de verdad. */
const viajeBase = () => ({
  id: 'prueba',
  fechas: { inicio: '2026-05-01', fin: '2026-05-02' },
  lugares: [
    { id: 'museo', nombre: 'Museo', categoria: 'patrimonio', coords: [40, -3], resumen: 'x' },
    { id: 'plaza', nombre: 'Plaza', categoria: 'pueblo', coords: [40.1, -3.1], resumen: 'y' },
  ],
  dias: [
    {
      fecha: '2026-05-01',
      titulo: 'Día 1',
      bloques: [
        { inicio: '10:00', fin: '11:00', lugar: 'museo' },
        { tipo: 'traslado', inicio: '11:00', fin: '11:15', modo: 'a-pie', desde: 'museo', hasta: 'plaza' },
        { inicio: '11:15', fin: '12:00', lugar: 'plaza' },
      ],
    },
    { fecha: '2026-05-02', titulo: 'Día 2', bloques: [{ inicio: '09:00', lugar: 'plaza' }] },
  ],
});

// --- Identidad de bloque --------------------------------------------------

test('la clave de un bloque no depende de su posición', () => {
  // Es el punto entero del diseño: si dependiera del índice, añadir una parada
  // a mitad del día haría que lo ocultado saltara a otro bloque.
  const v = viajeBase();
  const clave = claveEstable('2026-05-01', v.dias[0].bloques[2]);
  v.dias[0].bloques.unshift({ inicio: '08:00', lugar: 'museo' });
  assert.equal(claveEstable('2026-05-01', v.dias[0].bloques[3]), clave);
});

test('bloques distintos dan claves distintas', () => {
  const v = viajeBase();
  const [a, b, c] = v.dias[0].bloques.map((x) => claveEstable('2026-05-01', x));
  assert.equal(new Set([a, b, c]).size, 3);
});

test('el mismo bloque en días distintos no comparte clave', () => {
  const b = { inicio: '09:00', lugar: 'plaza' };
  assert.notEqual(claveEstable('2026-05-01', b), claveEstable('2026-05-02', b));
});

// --- Identificadores ------------------------------------------------------

test('idDesdeNombre quita acentos y deja kebab-case', () => {
  assert.equal(idDesdeNombre('Catedral de León'), 'catedral-de-leon');
  assert.equal(idDesdeNombre('  Peñalba  de   Santiago '), 'penalba-de-santiago');
  assert.equal(idDesdeNombre('¡Café & Bar!'), 'cafe-bar');
});

test('idDesdeNombre no repite un id que ya existe', () => {
  const usados = new Set(['museo', 'museo-2']);
  assert.equal(idDesdeNombre('Museo', usados), 'museo-3');
});

test('idDesdeNombre nunca devuelve vacío', () => {
  assert.equal(idDesdeNombre('¿¿¿'), 'lugar');
  assert.equal(idDesdeNombre(''), 'lugar');
  assert.equal(idDesdeNombre(null), 'lugar');
});

// --- Categoría desde OSM --------------------------------------------------

test('categoriaDesdeOsm reconoce lo evidente', () => {
  assert.equal(categoriaDesdeOsm('amenity', 'restaurant'), 'comida');
  assert.equal(categoriaDesdeOsm('tourism', 'hotel'), 'alojamiento');
  assert.equal(categoriaDesdeOsm('historic', 'castle'), 'patrimonio');
  assert.equal(categoriaDesdeOsm('tourism', 'viewpoint'), 'naturaleza');
  assert.equal(categoriaDesdeOsm('place', 'village'), 'pueblo');
  assert.equal(categoriaDesdeOsm('railway', 'station'), 'transporte');
});

test('lo que no se reconoce cae en practico, no se inventa una categoría', () => {
  assert.equal(categoriaDesdeOsm('lo_que_sea', 'ni_idea'), 'practico');
  assert.equal(categoriaDesdeOsm(undefined, undefined), 'practico');
});

// --- Lugar desde el buscador ---------------------------------------------

test('un resultado del buscador se convierte en lugar válido', () => {
  const l = lugarDesdeBusqueda({
    nombre: 'Peñalba de Santiago',
    coords: [42.42753, -6.54125],
    zona: 'El Bierzo',
    osm: { clave: 'place', valor: 'village' },
  });
  assert.equal(l.id, 'penalba-de-santiago');
  assert.equal(l.categoria, 'pueblo');
  assert.deepEqual(l.coords, [42.42753, -6.54125]);
  assert.equal(l.origen, 'propio');
  assert.ok(l.verificado.fecha);
});

test('las coordenadas se redondean a cinco decimales', () => {
  const l = lugarDesdeBusqueda({ nombre: 'X', coords: [42.123456789, -6.987654321] });
  assert.deepEqual(l.coords, [42.12346, -6.98765]);
});

test('una categoría explícita gana a la deducida de OSM', () => {
  const l = lugarDesdeBusqueda({ nombre: 'X', coords: [40, -3], categoria: 'comida', osm: { clave: 'historic', valor: 'castle' } });
  assert.equal(l.categoria, 'comida');
});

test('se rechaza lo que no se puede pintar en un mapa', () => {
  assert.throws(() => lugarDesdeBusqueda({ nombre: 'X' }), /coordenadas/);
  assert.throws(() => lugarDesdeBusqueda({ coords: [40, -3] }), /nombre/);
  assert.throws(() => lugarDesdeBusqueda({ nombre: 'X', coords: [200, -3] }), /rango/);
  assert.throws(() => lugarDesdeBusqueda({ nombre: 'X', coords: ['a', 'b'] }), /rango/);
});

// --- Aplicar la capa ------------------------------------------------------

test('sin capa, el viaje sale exactamente igual', () => {
  const v = viajeBase();
  const { viaje, resumen } = aplicarCapa(v, capaVacia());
  assert.deepEqual(viaje.dias[0].bloques, v.dias[0].bloques);
  assert.deepEqual(resumen, { anadidos: 0, ocultos: 0, lugares: 0 });
});

test('aplicar la capa NO toca el viaje original', () => {
  // Si mutara, volver a aplicar otra capa partiría de un viaje ya modificado.
  const v = viajeBase();
  const copia = JSON.parse(JSON.stringify(v));
  aplicarCapa(v, {
    lugares: [{ id: 'nuevo', nombre: 'N', categoria: 'comida', coords: [40, -3], resumen: 'z' }],
    bloques: [{ id: 'b1', fecha: '2026-05-01', lugar: 'nuevo', inicio: '13:00' }],
    ocultos: [claveEstable('2026-05-01', v.dias[0].bloques[0])],
  });
  assert.deepEqual(v, copia, 'el viaje base ha cambiado');
});

test('una parada añadida entra en su día y en su hora', () => {
  const capa = {
    lugares: [{ id: 'bar', nombre: 'Bar', categoria: 'comida', coords: [40.05, -3.05], resumen: 'z' }],
    bloques: [{ id: 'b1', fecha: '2026-05-01', lugar: 'bar', inicio: '10:30', fin: '10:50' }],
    ocultos: [],
  };
  const { viaje, resumen } = aplicarCapa(viajeBase(), capa);
  const dia = viaje.dias[0];
  assert.equal(dia.bloques.length, 4);
  assert.equal(dia.bloques[1].lugar, 'bar', 'debería colarse entre las 10:00 y las 11:00');
  assert.equal(dia.bloques[1].propio, true);
  assert.equal(resumen.anadidos, 1);
  assert.ok(viaje.lugares.some((l) => l.id === 'bar'));
});

test('una parada oculta desaparece del día', () => {
  const v = viajeBase();
  const capa = { ...capaVacia(), ocultos: [claveEstable('2026-05-01', v.dias[0].bloques[0])] };
  const { viaje, resumen } = aplicarCapa(v, capa);
  assert.equal(viaje.dias[0].bloques.length, 2);
  assert.ok(!viaje.dias[0].bloques.some((b) => b.lugar === 'museo' && b.inicio === '10:00'));
  assert.equal(resumen.ocultos, 1);
});

test('ocultar en un día no afecta al mismo lugar en otro día', () => {
  const v = viajeBase();
  const capa = { ...capaVacia(), ocultos: [claveEstable('2026-05-01', v.dias[0].bloques[2])] };
  const { viaje } = aplicarCapa(v, capa);
  assert.equal(viaje.dias[0].bloques.length, 2);
  assert.equal(viaje.dias[1].bloques.length, 1, 'el día 2 no se toca');
});

test('un lugar propio que choca con uno del JSON se descarta: manda el archivo', () => {
  const capa = {
    ...capaVacia(),
    lugares: [{ id: 'museo', nombre: 'Museo falso', categoria: 'comida', coords: [0.5, 0.5], resumen: 'no' }],
  };
  const { viaje, resumen } = aplicarCapa(viajeBase(), capa);
  assert.equal(viaje.lugares.filter((l) => l.id === 'museo').length, 1);
  assert.equal(viaje.lugares.find((l) => l.id === 'museo').nombre, 'Museo');
  assert.equal(resumen.lugares, 0);
});

test('añadir y ocultar a la vez funciona', () => {
  const v = viajeBase();
  const capa = {
    lugares: [{ id: 'bar', nombre: 'Bar', categoria: 'comida', coords: [40.05, -3.05], resumen: 'z' }],
    bloques: [{ id: 'b1', fecha: '2026-05-01', lugar: 'bar', inicio: '13:00' }],
    ocultos: [claveEstable('2026-05-01', v.dias[0].bloques[0])],
  };
  const { viaje, resumen } = aplicarCapa(v, capa);
  assert.equal(viaje.dias[0].bloques.length, 3);
  assert.equal(viaje.dias[0].bloques.at(-1).lugar, 'bar');
  assert.deepEqual(resumen, { anadidos: 1, ocultos: 1, lugares: 1 });
});

test('una capa que apunta a un día inexistente no rompe nada', () => {
  const capa = {
    ...capaVacia(),
    lugares: [{ id: 'bar', nombre: 'Bar', categoria: 'comida', coords: [40, -3], resumen: 'z' }],
    bloques: [{ id: 'b1', fecha: '2030-01-01', lugar: 'bar', inicio: '10:00' }],
  };
  const { viaje, resumen } = aplicarCapa(viajeBase(), capa);
  assert.equal(viaje.dias.length, 2);
  assert.equal(resumen.anadidos, 0, 'no se cuenta lo que no cae en ningún día');
});

test('ocultosDelDia devuelve lo que se ha quitado, para poder restaurarlo', () => {
  const v = viajeBase();
  const capa = { ...capaVacia(), ocultos: [claveEstable('2026-05-01', v.dias[0].bloques[0])] };
  const fuera = ocultosDelDia(v, capa, '2026-05-01');
  assert.equal(fuera.length, 1);
  assert.equal(fuera[0].lugar, 'museo');
  assert.equal(ocultosDelDia(v, capa, '2026-05-02').length, 0);
});

// --- Validación -----------------------------------------------------------

test('una capa vacía es válida', () => {
  assert.deepEqual(validarCapa(capaVacia()), []);
});

test('la validación caza lo que rompería el itinerario', () => {
  const fallos = validarCapa({
    lugares: [{ id: 'a', nombre: 'A', categoria: 'inventada', coords: [40, -3] }, { id: 'a', nombre: 'B', coords: [1, 1], categoria: 'comida' }],
    bloques: [{ fecha: 'ayer', lugar: 'fantasma', inicio: '99:99' }],
    ocultos: [],
  });
  assert.ok(fallos.some((f) => /categoría no válida/.test(f)));
  assert.ok(fallos.some((f) => /id repetido/.test(f)));
  assert.ok(fallos.some((f) => /fecha no válida/.test(f)));
  assert.ok(fallos.some((f) => /no existe/.test(f)));
  assert.ok(fallos.some((f) => /hora no válida/.test(f)));
});

test('lo que no es una capa se rechaza en vez de reventar', () => {
  assert.deepEqual(validarCapa(null), ['la capa no es un objeto']);
  assert.ok(validarCapa({}).length >= 3);
});

// --- Puente hacia el JSON del viaje --------------------------------------

test('comoJsonDelViaje deja lo añadido listo para pegar en el archivo', () => {
  const capa = {
    ...capaVacia(),
    lugares: [{ id: 'bar', nombre: 'Bar', categoria: 'comida', coords: [40, -3], resumen: 'z', origen: 'propio' }],
    bloques: [
      { id: 'b1', fecha: '2026-05-01', lugar: 'bar', inicio: '13:00', nota: 'comer' },
      { id: 'b2', fecha: '2026-05-01', lugar: 'bar', inicio: '20:00' },
    ],
  };
  const j = comoJsonDelViaje(capa);
  assert.equal(j.lugares.length, 1);
  assert.equal(j.lugares[0].origen, undefined, 'origen es interno, no va al archivo');
  assert.equal(j.bloquesPorDia['2026-05-01'].length, 2);
  assert.equal(j.bloquesPorDia['2026-05-01'][0].nota, 'comer');
});
