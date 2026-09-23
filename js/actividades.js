/**
 * Las actividades de un día: en qué estado está cada una, qué toca ahora, y el
 * resumen del día en cifras.
 *
 * Una «actividad» es un bloque de visita: estar en un sitio. Los traslados no lo
 * son —son el tiempo entre dos actividades— y los hitos tampoco, porque no se
 * pueden reservar ni dejar de hacer.
 *
 * Vive aparte y **sin DOM ni localStorage**, igual que `agenda.js`: es lo que
 * decide qué sale en «Pendientes» o qué se enseña como «Ahora», y un fallo aquí
 * no da error — manda a alguien a un sitio que ya visitó o esconde la reserva
 * que faltaba. Se prueba entero en Node.
 *
 * Espera días **ya normalizados** por `datos.js`: con `lugar` resuelto en cada
 * visita, `lugarDesde` y `lugarHasta` en cada traslado, y `claveActividad`.
 */

import { aMinutos } from './horarios.js';

// --- Estados ---------------------------------------------------------------

/**
 * Los estados que puede tener una actividad, en el orden en que se enseñan.
 *
 * El color no es la única señal, a propósito: cada estado tiene su icono y su
 * palabra, porque un «reservado» en verde y un «hecho» en verde se confunden
 * con el sol de frente, y porque el color solo no es accesible.
 *
 * `guardado` dice dónde vive: `hecho` es de cada persona (`visitados`), los
 * otros dos son del viaje compartido (`capa.estados`), y `pendiente` y
 * `requiere-reserva` no se guardan: se deducen.
 */
export const ESTADOS = {
  pendiente:          { etiqueta: 'Por hacer',        icono: 'circulo', guardado: null },
  'requiere-reserva': { etiqueta: 'Requiere reserva', icono: 'aviso',   guardado: null },
  reservado:          { etiqueta: 'Reservado',        icono: 'entrada', guardado: 'capa' },
  hecho:              { etiqueta: 'Hecho',            icono: 'check',   guardado: 'visitados' },
  cancelado:          { etiqueta: 'Cancelado',        icono: 'cerrar',  guardado: 'capa' },
};

/** El filtro de la cronología: qué estados entran en cada pestaña. */
export const FILTROS = {
  todas:      { etiqueta: 'Todas',      estados: null },
  pendientes: { etiqueta: 'Pendientes', estados: ['pendiente', 'requiere-reserva'] },
  reservadas: { etiqueta: 'Reservadas', estados: ['reservado'] },
  hechas:     { etiqueta: 'Hechas',     estados: ['hecho'] },
};

export const esActividad = (b) => b?.tipo === 'visita' && Boolean(b.lugar);

/** Si el sitio pide reserva. Lo dice el lugar, o la propia actividad si se añadió así. */
export const necesitaReserva = (b) => Boolean(b?.reserva?.necesaria || b?.lugar?.reserva?.necesaria);

/**
 * El estado de una actividad.
 *
 * El orden de las preguntas es la regla, y cada una tiene su porqué:
 *  1. **Cancelado gana a todo.** Si se canceló, da igual que estuviera
 *     reservado: no se va.
 *  2. **Hecho gana a reservado.** Una vez dentro, la reserva ya cumplió.
 *  3. Reservado.
 *  4. Requiere reserva, si el sitio la pide y nadie la ha marcado.
 *  5. Por hacer.
 *
 * @param {object} bloque     Bloque normalizado.
 * @param {object} visitados  De `estadoDe(viaje).visitados`: por id de lugar.
 * @param {object} estados    De `capa.estados`: por clave de actividad.
 */
export function estadoDeActividad(bloque, { visitados = {}, estados = {} } = {}) {
  const guardado = estados?.[bloque?.claveActividad]?.estado || null;
  if (guardado === 'cancelado') return 'cancelado';
  if (bloque?.lugar && visitados?.[bloque.lugar.id]) return 'hecho';
  if (guardado === 'reservado') return 'reservado';
  if (necesitaReserva(bloque)) return 'requiere-reserva';
  return 'pendiente';
}

/** ¿Entra esta actividad en este filtro? `todas` deja pasar incluso lo cancelado. */
export function pasaFiltro(estado, filtro = 'todas') {
  const lista = FILTROS[filtro]?.estados;
  return !lista || lista.includes(estado);
}

/** Cuántas actividades de un día caen en cada filtro, para ponerlo en la pestaña. */
export function cuentasPorFiltro(dia, guardado) {
  const cuentas = Object.fromEntries(Object.keys(FILTROS).map((k) => [k, 0]));
  for (const b of (dia?.bloques || []).filter(esActividad)) {
    const e = estadoDeActividad(b, guardado);
    for (const k of Object.keys(FILTROS)) if (pasaFiltro(e, k)) cuentas[k] += 1;
  }
  return cuentas;
}

// --- Distancias -------------------------------------------------------------

/**
 * La distancia que dice el propio texto de un traslado, en metros, o `null`.
 *
 * **No se calcula nada**: los traslados del itinerario ya dicen «800 m por el
 * sendero» o «1,2 km bajando por Nerudova», escrito al montar el viaje. Aquí
 * solo se lee. Una línea recta entre dos coordenadas no es lo que se camina, y
 * enseñarla como «caminando» sería inventar el dato.
 *
 * «1.500 m» es mil quinientos metros, no uno y medio: en metros el punto es de
 * miles. En kilómetros la coma es la decimal.
 */
export function distanciaDeTexto(texto) {
  const m = /(\d+(?:[.,]\d+)?)\s*(km|m)(?![a-záéíóú])/i.exec(String(texto || ''));
  if (!m) return null;
  const unidad = m[2].toLowerCase();
  const n = unidad === 'm'
    ? Number(m[1].replace(/\./g, '').replace(',', '.'))
    : Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.round(unidad === 'km' ? n * 1000 : n);
}

// --- Resumen del día ----------------------------------------------------------

const minutosDe = (b) => {
  const d = aMinutos(b?.fin) - aMinutos(b?.inicio);
  return Number.isFinite(d) && d > 0 ? d : 0;
};

/**
 * El día en cifras, **solo con lo que el itinerario dice**.
 *
 *  · `desplazamientos` suma la duración real de los traslados, por modo.
 *  · `aPie.metros` es la suma de las distancias escritas, y **solo existe si
 *    todos los tramos a pie dicen la suya**. Con uno sin distancia, la suma
 *    sería menor que lo que se anda y parecería un dato completo; mejor callar.
 *  · `coste` suma los precios de entrada por persona. Lo exterior no cuenta
 *    —mirar una fachada no se paga— y lo cancelado tampoco. `sinPrecio` dice
 *    cuántas actividades no tienen precio declarado, para no vender el total
 *    como completo.
 */
export function resumenDelDia(dia, guardado = {}) {
  const bloques = dia?.bloques || [];
  const actividades = bloques.filter(esActividad);
  const conEstado = actividades.map((b) => ({ b, estado: estadoDeActividad(b, guardado) }));
  const vivas = conEstado.filter((x) => x.estado !== 'cancelado');

  const porModo = new Map();
  let tramosAPie = 0;
  let metrosAPie = 0;
  let aPieSinDistancia = 0;
  for (const t of bloques.filter((b) => b.tipo === 'traslado')) {
    const min = minutosDe(t);
    const modo = t.modo || 'otro';
    porModo.set(modo, (porModo.get(modo) || 0) + min);
    if (modo === 'a-pie') {
      tramosAPie += 1;
      const m = distanciaDeTexto(t.detalle);
      if (m === null) aPieSinDistancia += 1;
      else metrosAPie += m;
    }
  }

  let importe = 0;
  let conPrecio = 0;
  for (const { b } of vivas) {
    if (b.exterior) continue;
    const precio = b.coste ?? b.lugar?.precio?.importe;
    if (typeof precio === 'number') { importe += precio; conPrecio += 1; }
  }

  const horas = bloques.flatMap((b) => [aMinutos(b.inicio), aMinutos(b.fin)]).filter(Number.isFinite);

  return {
    actividades: vivas.length,
    hechas: vivas.filter((x) => x.estado === 'hecho').length,
    canceladas: conEstado.length - vivas.length,
    desde: horas.length ? Math.min(...horas) : null,
    hasta: horas.length ? Math.max(...horas) : null,
    desplazamientos: {
      minutos: [...porModo.values()].reduce((s, n) => s + n, 0),
      porModo: [...porModo.entries()].map(([modo, minutos]) => ({ modo, minutos })).sort((a, b) => b.minutos - a.minutos),
    },
    aPie: {
      tramos: tramosAPie,
      minutos: porModo.get('a-pie') || 0,
      metros: tramosAPie && !aPieSinDistancia ? metrosAPie : null,
    },
    coste: { importe, conPrecio, sinPrecio: vivas.filter(({ b }) => !b.exterior).length - conPrecio },
    reservas: {
      hechas: vivas.filter((x) => x.estado === 'reservado').length,
      pendientes: vivas.filter((x) => x.estado === 'requiere-reserva').length,
    },
  };
}

// --- Qué toca ahora -----------------------------------------------------------

/**
 * Dónde está el día a esta hora: lo que está pasando, lo siguiente, y lo que
 * queda.
 *
 * `actual` es un bloque —visita, traslado o hito— que ha empezado y no ha
 * terminado. Un bloque sin `fin` dura hasta que empieza el siguiente: es como
 * está escrito el itinerario («a las 21:00, llegada»).
 *
 * `siguiente` es la próxima **actividad** que no está hecha ni cancelada. Se
 * salta lo hecho a propósito: si fuiste antes a la iglesia, lo siguiente que
 * te importa no es la iglesia.
 *
 * `restantes` son las actividades que quedan por delante, y `pasadas` las que
 * ya quedaron atrás en el reloj, estén hechas o no.
 */
export function momentoDelDia(dia, minutos, guardado = {}) {
  const bloques = dia?.bloques || [];
  const fines = bloques.map((b, i) => {
    const f = aMinutos(b.fin);
    if (Number.isFinite(f) && f > aMinutos(b.inicio)) return f;
    const siguiente = bloques.slice(i + 1).map((x) => aMinutos(x.inicio)).find(Number.isFinite);
    return siguiente ?? aMinutos(b.inicio) + 1;
  });

  let actual = null;
  bloques.forEach((b, i) => {
    const ini = aMinutos(b.inicio);
    if (Number.isFinite(ini) && ini <= minutos && minutos < fines[i]) actual = b;
  });

  const vivas = (b) => !['hecho', 'cancelado'].includes(estadoDeActividad(b, guardado));
  const actividades = bloques.filter(esActividad);
  const restantes = actividades.filter((b) => b !== actual && aMinutos(b.inicio) >= minutos);
  const siguiente = restantes.find(vivas) || null;
  const pasadas = actividades.filter((b) => b !== actual && aMinutos(b.inicio) < minutos);

  // Cómo se llega a lo siguiente: el traslado del itinerario que acaba allí y
  // empieza después de lo actual. Da el modo para el enlace de Google Maps.
  const llegada = siguiente
    ? bloques.find((b) => b.tipo === 'traslado' && b.lugarHasta?.id === siguiente.lugar.id
        && aMinutos(b.inicio) <= aMinutos(siguiente.inicio) && aMinutos(b.fin) >= minutos - 1) || null
    : null;

  const empieza = bloques.map((b) => aMinutos(b.inicio)).find(Number.isFinite);
  let fase = 'en-marcha';
  if (!bloques.length) fase = 'sin-plan';
  else if (Number.isFinite(empieza) && minutos < empieza) fase = 'antes';
  else if (!actual && !restantes.length) fase = 'terminado';

  return { fase, actual, siguiente, llegada, restantes, pasadas };
}

// --- El viaje entero --------------------------------------------------------------

/**
 * Cómo va el viaje, para su tarjeta en la portada.
 *
 * «Organizada» es una actividad con hora y sin una reserva pendiente: lo que ya
 * no pide nada antes de salir. Es la cifra útil mientras se planifica; durante
 * y después del viaje lo que se quiere ver son las hechas, y eso lo decide la
 * vista según el estado del viaje, no esta función.
 */
export function progresoDelViaje(viaje, guardado = {}) {
  let total = 0;
  let hechas = 0;
  let organizadas = 0;
  let porReservar = 0;
  for (const dia of viaje?.dias || []) {
    for (const b of (dia.bloques || []).filter(esActividad)) {
      const e = estadoDeActividad(b, guardado);
      if (e === 'cancelado') continue;
      total += 1;
      if (e === 'hecho') hechas += 1;
      if (e === 'requiere-reserva') porReservar += 1;
      else if (Number.isFinite(aMinutos(b.inicio))) organizadas += 1;
    }
  }
  return { total, hechas, organizadas, porReservar };
}

/**
 * Las zonas del viaje en el orden en que se recorren, sin repetir: «Staré Město
 * → Malá Strana → Hradčany». Se cortan a `max` porque en una tarjeta caben tres;
 * `mas` dice cuántas quedan fuera.
 */
export function recorridoDelViaje(viaje, max = 3) {
  const zonas = [];
  for (const dia of viaje?.dias || []) {
    for (const b of (dia.bloques || []).filter(esActividad)) {
      const z = b.lugar.zona;
      if (z && !zonas.includes(z)) zonas.push(z);
    }
  }
  return { zonas: zonas.slice(0, max), mas: Math.max(0, zonas.length - max) };
}
