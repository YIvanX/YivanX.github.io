/**
 * Qué pertenece a qué: a un día, al viaje entero, a los preparativos o a la
 * vuelta.
 *
 * Vive aparte y **sin DOM ni localStorage** por la misma razón que
 * `personalizacion.js`: es lo que decide si un aviso se enseña o no, y un fallo
 * aquí no da error — hace desaparecer el aviso justo el día que hacía falta. Se
 * prueba entero en Node.
 *
 * La regla de reparto, en una línea: **un aviso o una lista sin `dias` y sin
 * `momento` es del viaje entero**, que es como se comportaba todo antes de que
 * estos dos campos existieran. Así, un archivo que no los use se ve igual que
 * siempre.
 */

import { aMinutos } from './horarios.js';

const enLista = (v) => (Array.isArray(v) ? v : []);

/** Sin fecha y sin momento declarados: es del viaje. */
const esGeneral = (x) => !enLista(x?.dias).length && !x?.momento;

// --- Avisos ---------------------------------------------------------------

/**
 * Los avisos que declaran esta fecha.
 *
 * Un aviso puede llevar `momento: "pre"` **y** `dias` a la vez, y entonces sale
 * en los dos sitios. No es un descuido: «el recorrido largo de Valporquero se
 * reserva» hay que leerlo antes de salir para reservarlo, y otra vez el día que
 * toca ir.
 */
export function avisosDelDia(viaje, fecha) {
  return enLista(viaje?.avisos).filter((a) => enLista(a.dias).includes(fecha));
}

/** Los que no son de ningún día ni de ningún momento: van en la portada. */
export function avisosDelViaje(viaje) {
  return enLista(viaje?.avisos).filter(esGeneral);
}

/** Los de preparación o los de la vuelta. `momento` es 'pre' o 'post'. */
export function avisosDeMomento(viaje, momento) {
  return enLista(viaje?.avisos).filter((a) => a.momento === momento);
}

// --- Listas ---------------------------------------------------------------

/**
 * Las listas de un ámbito, que es 'viaje', 'pre', 'post' o una fecha ISO.
 * Una fecha se compara contra `dias`; los demás, contra `momento`.
 */
export function listasDe(viaje, ambito) {
  const listas = enLista(viaje?.listas);
  if (ambito === 'viaje') return listas.filter(esGeneral);
  if (ambito === 'pre' || ambito === 'post') return listas.filter((l) => l.momento === ambito);
  return listas.filter((l) => enLista(l.dias).includes(ambito));
}

/** Cuántas tareas hechas de cuántas, sobre un conjunto de listas. */
export function progresoDeListas(listas, tareas = {}) {
  let total = 0;
  let hechas = 0;
  for (const lista of enLista(listas)) {
    for (const item of enLista(lista.items)) {
      total += 1;
      if (tareas[item.id]) hechas += 1;
    }
  }
  return { hechas, total };
}

// --- Transporte -----------------------------------------------------------

/**
 * Los tramos de un día, **calculados de sus propios bloques de traslado**.
 *
 * No se lee `transporte[]` a propósito. Esa tabla se escribe a mano y duplica
 * tramos que el día ya tiene: en este viaje, 5 de sus 7 entradas repetían un
 * bloque, y una de ellas ya había dejado de coincidir con él. Calculándolo del
 * itinerario no hay dos sitios que puedan discrepar.
 *
 * Espera el día **ya normalizado** por `datos.js`, que es quien resuelve
 * `lugarDesde` y `lugarHasta` contra el catálogo de lugares.
 */
export function tramosDelDia(dia) {
  return enLista(dia?.bloques)
    .filter((b) => b.tipo === 'traslado')
    .map((b) => ({
      fecha: dia.fecha,
      inicio: b.inicio || '',
      fin: b.fin || '',
      // NaN en cualquiera de los dos extremos cae a 0: un traslado sin hora
      // sigue siendo un traslado, solo que sin duración que enseñar.
      minutos: (aMinutos(b.fin) - aMinutos(b.inicio)) || 0,
      modo: b.modo || null,
      desde: b.lugarDesde || null,
      hasta: b.lugarHasta || null,
      detalle: b.detalle || '',
      opcional: Boolean(b.opcional),
    }));
}

/** Todos los tramos del viaje, agrupados por día. Los días sin traslado no salen. */
export function tramosDelViaje(viaje) {
  return enLista(viaje?.dias)
    .map((dia) => ({ dia, tramos: tramosDelDia(dia) }))
    .filter((g) => g.tramos.length);
}

/** Los modos usados y el tiempo total, para poder resumir sin desplegar. */
export function resumenDeTramos(tramos) {
  const lista = enLista(tramos);
  return {
    cuantos: lista.length,
    minutos: lista.reduce((suma, t) => suma + (t.minutos || 0), 0),
    modos: [...new Set(lista.map((t) => t.modo).filter(Boolean))],
  };
}

// --- Preparativos y vuelta ------------------------------------------------

/**
 * ¿Hay pestaña «Preparativos»?
 *
 * La tabla `transporte[]` cuenta: lo que queda en ella cuando los tramos se
 * calculan del itinerario son contratos y reservas —el alquiler del coche, por
 * ejemplo—, y eso es exactamente cosa de antes de salir.
 */
export function hayPreViaje(viaje) {
  return Boolean(
    listasDe(viaje, 'pre').length
    || avisosDeMomento(viaje, 'pre').length
    || enLista(viaje?.transporte).length,
  );
}

/**
 * ¿Hay pestaña «Al volver»?
 *
 * Se pregunta en vez de darla por hecha: sin listas de vuelta y con el viaje sin
 * terminar estaría vacía los seis días, y una pestaña que no lleva a nada es
 * peor que no tenerla.
 */
export function hayPostViaje(viaje) {
  return Boolean(
    listasDe(viaje, 'post').length
    || avisosDeMomento(viaje, 'post').length
    || viaje?.estadoReal === 'completado',
  );
}

/**
 * Si un día merece un punto en la barra: tiene aviso propio o lista sin acabar.
 * Es el pago de todo el reparto — que se vea desde fuera, sin entrar en el día.
 */
export function diaTieneAtencion(viaje, fecha, tareas = {}) {
  if (avisosDelDia(viaje, fecha).length) return true;
  const { hechas, total } = progresoDeListas(listasDe(viaje, fecha), tareas);
  return total > 0 && hechas < total;
}
