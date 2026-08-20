/**
 * Pruebas de js/sincronizacion.js — lo que decide qué gana entre este
 * dispositivo y la nube.
 *
 *   node --test herramientas/sincronizacion.test.mjs
 *
 * Se prueba la mitad pura, que es donde está el riesgo: un fallo aquí **no da
 * error**. Hace desaparecer una parada que añadiste sin cobertura, o te borra
 * una nota al entrar desde otro móvil, y eso se descubre tarde y sin rastro.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMPO_CAPA, separar, juntar, fusionarCapas, fusionarEstado, difieren,
  estadoDeBloque, contarPendientes,
} from '../js/sincronizacion.js';
import { capaVacia, validarCapa } from '../js/personalizacion.js';

const capa = (extra = {}) => ({
  version: 1,
  lugares: [{ id: 'mirador', nombre: 'Mirador', categoria: 'naturaleza', coords: [42.5, -6.5] }],
  bloques: [{ id: 'b1', fecha: '2026-08-31', lugar: 'mirador', inicio: '17:00' }],
  ocultos: ['2026-08-30#musac#10:00'],
  ...extra,
});

const documento = (extra = {}) => ({
  id: 'leon-2026-08',
  titulo: 'León',
  fechas: { inicio: '2026-08-29', fin: '2026-09-03' },
  lugares: [{ id: 'musac', nombre: 'MUSAC' }],
  dias: [{ fecha: '2026-08-29', bloques: [] }],
  ...extra,
});

// --- separar --------------------------------------------------------------

test('separar deja el viaje base sin rastro de la capa ni de los metadatos', () => {
  const r = separar({ ...documento(), [CAMPO_CAPA]: capa(), versionNube: 7, actualizadoEn: 'x' });
  assert.equal(r.version, 7);
  assert.deepEqual(r.capa, capa());
  assert.ok(!(CAMPO_CAPA in r.bruto), 'la capa no puede quedarse dentro del viaje base');
  assert.ok(!('versionNube' in r.bruto));
  assert.ok(!('actualizadoEn' in r.bruto));
  assert.equal(r.bruto.titulo, 'León');
});

test('separar de un documento sin capa devuelve capa nula, no una vacía', () => {
  // La diferencia importa: nula significa «la nube no opina», y entonces manda
  // la capa local. Una vacía significaría «la nube dice que no hay nada», que
  // borraría lo añadido en este dispositivo.
  const r = separar({ ...documento(), versionNube: 1 });
  assert.equal(r.capa, null);
});

test('separar de nada devuelve nada', () => {
  assert.equal(separar(null), null);
  assert.equal(separar('texto'), null);
});

test('una capa corrupta en la nube no impide abrir el viaje', () => {
  const r = separar({ ...documento(), [CAMPO_CAPA]: { lugares: 'esto no es una lista' }, versionNube: 2 });
  assert.equal(r.capa, null, 'la capa mala se descarta');
  assert.equal(r.bruto.titulo, 'León', 'y el viaje se abre igual');
});

// --- juntar ---------------------------------------------------------------

test('juntar mete la capa y limpia los metadatos y cualquier capa anterior', () => {
  const doc = juntar({ ...documento(), versionNube: 3, actualizadoEn: 'x', [CAMPO_CAPA]: capaVacia() }, capa());
  assert.deepEqual(doc[CAMPO_CAPA], capa());
  assert.ok(!('versionNube' in doc));
  assert.ok(!('actualizadoEn' in doc));
});

test('juntar sin capa deja una vacía, nunca undefined', () => {
  assert.deepEqual(juntar(documento(), null)[CAMPO_CAPA], capaVacia());
});

test('juntar y separar son la ida y la vuelta del mismo camino', () => {
  const r = separar({ ...juntar(documento(), capa()), versionNube: 4 });
  assert.deepEqual(r.bruto, documento());
  assert.deepEqual(r.capa, capa());
});

// --- fusionarCapas --------------------------------------------------------

test('fundir no duplica lo que ya estaba en las dos', () => {
  const r = fusionarCapas(capa(), capa());
  assert.equal(r.bloques.length, 1);
  assert.equal(r.lugares.length, 1);
  assert.equal(r.ocultos.length, 1);
});

test('lo añadido sin cobertura sobrevive a la primera carga con conexión', () => {
  const local = capa({
    lugares: [...capa().lugares, { id: 'bar', nombre: 'Bar', categoria: 'comida', coords: [42, -6] }],
    bloques: [...capa().bloques, { id: 'b2', fecha: '2026-08-31', lugar: 'bar', inicio: '21:00' }],
  });
  const r = fusionarCapas(local, capa());
  assert.deepEqual(r.bloques.map((b) => b.id).sort(), ['b1', 'b2']);
  assert.ok(r.lugares.some((l) => l.id === 'bar'), 'y su lugar viene con él');
});

test('lo ocultado en cualquiera de los dos sigue ocultado', () => {
  const otro = capa({ ocultos: ['2026-09-01#musac#12:00'] });
  const r = fusionarCapas(capa(), otro);
  assert.deepEqual(r.ocultos.sort(), ['2026-08-30#musac#10:00', '2026-09-01#musac#12:00']);
});

test('un lugar que ya no usa ningún bloque no se queda para siempre', () => {
  const huerfano = capa({ bloques: [] });
  const r = fusionarCapas(huerfano, huerfano);
  assert.deepEqual(r.lugares, [], 'sin bloque que lo use, el lugar sobra');
});

test('fundir da el mismo resultado en un orden y en el otro', () => {
  const otro = capa({
    lugares: [{ id: 'bar', nombre: 'Bar', categoria: 'comida', coords: [42, -6] }],
    bloques: [{ id: 'b2', fecha: '2026-08-31', lugar: 'bar', inicio: '21:00' }],
    ocultos: ['2026-09-02#orellan#14:00'],
  });
  const ida = fusionarCapas(capa(), otro);
  const vuelta = fusionarCapas(otro, capa());
  assert.deepEqual(ida.bloques.map((b) => b.id).sort(), vuelta.bloques.map((b) => b.id).sort());
  assert.deepEqual(ida.ocultos.sort(), vuelta.ocultos.sort());
  assert.deepEqual(ida.lugares.map((l) => l.id).sort(), vuelta.lugares.map((l) => l.id).sort());
});

test('lo fundido sigue siendo una capa válida', () => {
  assert.deepEqual(validarCapa(fusionarCapas(capa(), capa())), []);
});

test('fundir con nada no rompe', () => {
  assert.deepEqual(fusionarCapas(null, null), capaVacia());
  assert.equal(fusionarCapas(capa(), null).bloques.length, 1);
  assert.equal(fusionarCapas(null, capa()).bloques.length, 1);
});

// --- fusionarEstado -------------------------------------------------------

test('en un choque gana lo de este dispositivo, y la nube solo rellena huecos', () => {
  const local = { notas: { musac: 'lo que escribí aquí' }, visitados: { musac: '2026-08-30' } };
  const remoto = { notas: { musac: 'lo del otro móvil', catedral: 'esta no la tenía' }, tareas: { bono: 'sí' } };
  const r = fusionarEstado(local, remoto);
  assert.equal(r.notas.musac, 'lo que escribí aquí');
  assert.equal(r.notas.catedral, 'esta no la tenía');
  assert.equal(r.tareas.bono, 'sí');
  assert.equal(r.visitados.musac, '2026-08-30');
});

test('fundir estado con nada devuelve las cuatro claves vacías', () => {
  assert.deepEqual(fusionarEstado(null, null), { visitados: {}, notas: {}, tareas: {}, vistos: {} });
});

// --- difieren -------------------------------------------------------------

test('difieren no se deja engañar por el orden', () => {
  const a = capa({ ocultos: ['x', 'y'] });
  const b = capa({ ocultos: ['y', 'x'] });
  assert.equal(difieren(a, b), false);
});

test('difieren caza una parada añadida y una quitada', () => {
  assert.equal(difieren(capa(), capa({ bloques: [] })), true);
  assert.equal(difieren(capa(), capa({ ocultos: [] })), true);
  assert.equal(difieren(capaVacia(), null), false);
});

// --- estadoDeBloque -------------------------------------------------------

test('una parada del archivo no tiene estado de nube, y eso es lo correcto', () => {
  // Si las 25 llevaran icono, el que importa no se vería. La clave es una que
  // la nube NO tiene por oculta: es una parada del archivo y ahí sigue.
  assert.equal(estadoDeBloque({ lugar: 'catedral' }, '2026-08-29#catedral#11:00', capa()), null);
});

test('una parada añadida por ti está pendiente hasta que sube', () => {
  const bloque = { propio: true, idPropio: 'b9' };
  assert.equal(estadoDeBloque(bloque, '', capa()), 'pendiente');
  assert.equal(estadoDeBloque({ propio: true, idPropio: 'b1' }, '', capa()), 'en-nube');
});

test('una parada del archivo que restauraste sigue pendiente mientras la nube la crea quitada', () => {
  // Si el bloque se está pintando es que localmente está visible; que la nube lo
  // tenga en `ocultos` significa que allí sigue quitado. Eso es un cambio sin subir.
  assert.equal(estadoDeBloque({ lugar: 'musac' }, '2026-08-30#musac#10:00', capa()), 'pendiente');
});

test('sin capa subida no se inventa un estado', () => {
  assert.equal(estadoDeBloque({ propio: true, idPropio: 'b1' }, '', null), 'pendiente');
});

// --- contarPendientes -----------------------------------------------------

test('sin diferencias no hay nada pendiente', () => {
  assert.equal(contarPendientes(capa(), capa()), 0);
  assert.equal(contarPendientes(null, null), 0);
});

test('cuenta lo añadido, lo borrado, lo quitado y lo restaurado', () => {
  const subida = capa();

  const anadido = capa({ bloques: [...capa().bloques, { id: 'b2', fecha: '2026-08-31', lugar: 'mirador', inicio: '21:00' }] });
  assert.equal(contarPendientes(anadido, subida), 1, 'una parada añadida');

  const borrado = capa({ bloques: [] });
  assert.equal(contarPendientes(borrado, subida), 1, 'una parada propia borrada');

  const quitado = capa({ ocultos: [...capa().ocultos, '2026-09-01#musac#12:00'] });
  assert.equal(contarPendientes(quitado, subida), 1, 'una parada del archivo quitada');

  const restaurado = capa({ ocultos: [] });
  assert.equal(contarPendientes(restaurado, subida), 1, 'una parada restaurada');
});

test('varios cambios a la vez se suman, que es lo que se enseña en la barra', () => {
  const local = capa({
    bloques: [...capa().bloques, { id: 'b2', fecha: '2026-08-31', lugar: 'mirador', inicio: '21:00' }],
    ocultos: [],
  });
  assert.equal(contarPendientes(local, capa()), 2, 'uno añadido + uno restaurado');
});

test('lo pendiente y `difieren` nunca se contradicen', () => {
  const pares = [
    [capa(), capa()],
    [capa({ bloques: [] }), capa()],
    [capa({ ocultos: ['x'] }), capa()],
    [capaVacia(), capa()],
  ];
  for (const [a, b] of pares) {
    assert.equal(contarPendientes(a, b) > 0, difieren(a, b), 'uno dice que hay cambios y el otro que no');
  }
});
