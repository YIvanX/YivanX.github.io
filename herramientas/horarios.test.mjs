/**
 * Pruebas de js/horarios.js.
 *
 *   node --test herramientas/
 *
 * Sin dependencias: el `node:test` que viene de serie basta.
 *
 * Se prueba esto y no otra cosa porque `horarios.js` es la **única lógica
 * compartida** entre el navegador y el validador, y la más sutil: cruces de
 * medianoche, días sin apertura, huecos entre franjas. Si se rompe, no se
 * rompe con un error: se rompe diciendo que algo abre cuando está cerrado, y
 * eso se descubre delante de una puerta.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aFecha, claveDia, aIso, aMinutos, aHora, franjasDe, estadoEn,
  textoHorario, revisarBloque, diasEntre, fechaLarga, estadoPorFecha,
} from '../js/horarios.js';

// Referencias: 2026-08-30 es domingo · 08-31 lunes · 09-01 martes · 09-02 miércoles.
const DOMINGO = '2026-08-30';
const LUNES = '2026-08-31';
const MARTES = '2026-09-01';

const museo = {
  nombre: 'Museo',
  horarios: {
    mar: [['10:00', '14:00'], ['16:00', '19:00']],
    mie: [['10:00', '14:00']],
    dom: [['10:00', '14:00']],
  },
};
const plaza = { nombre: 'Plaza' };                       // sin horarios: siempre accesible
const bar = { nombre: 'Bar', horarios: { dom: [['19:30', '00:00']] } };  // cruza medianoche

// --- Fechas ---------------------------------------------------------------

test('las fechas se leen en hora local, no en UTC', () => {
  // `new Date("2026-08-30")` es UTC y en España devuelve el día anterior a
  // partir de cierta hora. Eso desplazaría el itinerario entero un día.
  const f = aFecha('2026-08-30');
  assert.equal(f.getFullYear(), 2026);
  assert.equal(f.getMonth(), 7);
  assert.equal(f.getDate(), 30);
  assert.equal(aIso(f), '2026-08-30');
});

test('claveDia acierta el día de la semana', () => {
  assert.equal(claveDia(DOMINGO), 'dom');
  assert.equal(claveDia(LUNES), 'lun');
  assert.equal(claveDia(MARTES), 'mar');
  assert.equal(claveDia('2026-09-05'), 'sab');
});

test('diasEntre incluye los dos extremos y cruza el cambio de mes', () => {
  const d = diasEntre('2026-08-29', '2026-09-03');
  assert.equal(d.length, 6);
  assert.equal(d[0], '2026-08-29');
  assert.equal(d[1], '2026-08-30');
  assert.equal(d[3], '2026-09-01');
  assert.equal(d[5], '2026-09-03');
});

test('fechaLarga se escribe en español', () => {
  assert.equal(fechaLarga('2026-09-02'), 'miércoles, 2 de septiembre');
});

// --- Horas ----------------------------------------------------------------

test('aMinutos acepta lo válido y rechaza lo demás', () => {
  assert.equal(aMinutos('00:00'), 0);
  assert.equal(aMinutos('09:30'), 570);
  assert.equal(aMinutos('24:00'), 1440);
  assert.ok(Number.isNaN(aMinutos('25:00')));
  assert.ok(Number.isNaN(aMinutos('9:30')));
  assert.ok(Number.isNaN(aMinutos('')));
  assert.ok(Number.isNaN(aMinutos(undefined)));
});

test('aHora es la inversa y da la vuelta al pasar de medianoche', () => {
  assert.equal(aHora(570), '09:30');
  assert.equal(aHora(0), '00:00');
  assert.equal(aHora(1500), '01:00');       // 25:00 → 01:00
  assert.equal(aHora(-60), '23:00');
});

// --- Franjas --------------------------------------------------------------

test('sin objeto horarios devuelve null, que NO es lo mismo que cerrado', () => {
  // Una plaza o una muralla no tienen horario y están siempre accesibles.
  assert.equal(franjasDe(plaza, LUNES), null);
  assert.equal(textoHorario(plaza, LUNES), 'Sin horario: acceso libre');
});

test('un día ausente del objeto horarios significa cerrado', () => {
  assert.deepEqual(franjasDe(museo, LUNES), []);
  assert.equal(textoHorario(museo, LUNES), 'Cerrado');
});

test('una franja que cruza medianoche se normaliza más allá de 1440', () => {
  const [[desde, hasta]] = franjasDe(bar, DOMINGO);
  assert.equal(desde, 19 * 60 + 30);
  assert.equal(hasta, 1440, 'las 00:00 de cierre son el final del día, no el principio');
});

// --- Estado en un instante ------------------------------------------------

test('estadoEn distingue abierto, cerrado ahora y cerrado todo el día', () => {
  assert.equal(estadoEn(museo, MARTES, aMinutos('11:00')).estado, 'abierto');
  assert.equal(estadoEn(museo, MARTES, aMinutos('15:00')).estado, 'cerrado', 'está en el hueco de mediodía');
  assert.equal(estadoEn(museo, MARTES, aMinutos('21:00')).estado, 'cerrado');
  assert.equal(estadoEn(museo, LUNES, aMinutos('11:00')).estado, 'cerrado-hoy');
  assert.equal(estadoEn(plaza, LUNES, aMinutos('03:00')).estado, 'sin-horario');
});

test('el minuto de cierre ya está cerrado', () => {
  assert.equal(estadoEn(museo, MARTES, aMinutos('13:59')).estado, 'abierto');
  assert.equal(estadoEn(museo, MARTES, aMinutos('14:00')).estado, 'cerrado');
});

test('estando en el hueco, `abre` apunta a la franja siguiente', () => {
  const r = estadoEn(museo, MARTES, aMinutos('15:00'));
  assert.equal(aHora(r.abre), '16:00');
  assert.equal(aHora(r.cierra), '19:00');
});

// --- Revisión de un bloque del itinerario ---------------------------------

test('una visita dentro del horario pasa', () => {
  assert.equal(revisarBloque(museo, MARTES, { inicio: '11:00', fin: '13:00' }).nivel, 'ok');
});

test('una visita un día que cierra es error', () => {
  const r = revisarBloque(museo, LUNES, { inicio: '11:00' });
  assert.equal(r.nivel, 'error');
  assert.match(r.mensaje, /cierra los lunes/);
});

test('una visita fuera de franja es error, aunque el sitio abra ese día', () => {
  const r = revisarBloque(museo, MARTES, { inicio: '15:00' });
  assert.equal(r.nivel, 'error');
  assert.match(r.mensaje, /15:00/);
});

test('empezar dentro y acabar después del cierre es aviso, no error', () => {
  // Se llega a tiempo, pero te echan a media visita: hay que saberlo, no falla.
  const r = revisarBloque(museo, MARTES, { inicio: '13:00', fin: '15:00' });
  assert.equal(r.nivel, 'aviso');
  assert.match(r.mensaje, /14:00/);
});

test('un bloque exterior se salta el horario de taquilla', () => {
  // La catedral iluminada de noche, o una fachada. No se entra.
  assert.equal(revisarBloque(museo, LUNES, { inicio: '23:30', exterior: true }).nivel, 'ok');
  assert.equal(revisarBloque(museo, MARTES, { inicio: '03:00', exterior: true }).nivel, 'ok');
});

test('un lugar sin horarios nunca da error', () => {
  assert.equal(revisarBloque(plaza, LUNES, { inicio: '04:00' }).nivel, 'ok');
});

test('una visita nocturna que cruza medianoche pasa', () => {
  assert.equal(revisarBloque(bar, DOMINGO, { inicio: '23:30', fin: '24:00' }).nivel, 'ok');
});

test('sin lugar o sin hora no se inventa un veredicto', () => {
  assert.equal(revisarBloque(null, LUNES, { inicio: '11:00' }).nivel, 'ok');
  assert.equal(revisarBloque(museo, LUNES, {}).nivel, 'ok');
});

// --- Estado del viaje -----------------------------------------------------

test('el estado del viaje sale de la fecha, no de lo que diga el archivo', () => {
  const fechas = { inicio: '2026-08-29', fin: '2026-09-03' };
  assert.equal(estadoPorFecha(fechas, '2026-08-20'), 'planificado');
  assert.equal(estadoPorFecha(fechas, '2026-08-29'), 'en-curso', 'el primer día ya es en curso');
  assert.equal(estadoPorFecha(fechas, '2026-09-01'), 'en-curso');
  assert.equal(estadoPorFecha(fechas, '2026-09-03'), 'en-curso', 'el último día todavía es en curso');
  assert.equal(estadoPorFecha(fechas, '2026-09-04'), 'completado');
});
