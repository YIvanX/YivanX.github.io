/**
 * El tiempo de cada día del viaje.
 *
 * **Se calcula del itinerario, no se escribe en el archivo del viaje**, igual
 * que los tramos de transporte: la coordenada de cada día es el centroide de
 * sus paradas y la etiqueta son sus zonas. Un viaje nuevo no toca ni una línea,
 * y un día al que le añades una parada en la calle mueve su punto solo.
 *
 * **Por qué por día y no por la ciudad base**, que es la decisión que sostiene
 * todo lo demás: el 29 de agosto de 2026, en este mismo viaje, León daba 25,1°
 * y cubierto mientras los Argüellos daban 21,0° y llovizna. Son 205 m de
 * desnivel y 4 °C. Un solo bloque de «el tiempo en León» durante seis días
 * sería decoración, no un dato con el que se decide si subes a las Hoces.
 *
 * Fuente: Open-Meteo. Sin clave, con CORS y con atribución (CC BY 4.0). Se pide
 * **una sola vez** para todo el viaje: la API acepta las coordenadas separadas
 * por comas y devuelve un array de localidades en el mismo orden.
 *
 * Y la regla que manda sobre la red, que es la misma que la de la nube: **lo
 * guardado se sirve antes de pedir nada**. La red mejora lo que ya se ve, nunca
 * es la condición para verlo. Sin cobertura se pinta lo último que llegó,
 * diciendo de cuándo es.
 *
 * Este módulo no toca el DOM. El texto que se lee en pantalla se escribe en
 * `vistas/panel.js`; aquí solo hay datos y la tabla de códigos.
 */

import { aFecha, aIso, aMinutos } from './horarios.js';

const CLAVE = 'bitacora:v1:tiempo';
const API = 'https://api.open-meteo.com/v1/forecast';

/** Cuánto vale una respuesta antes de volver a pedirla: Open-Meteo se rehace cada hora. */
const FRESCO_MS = 60 * 60 * 1000;

/** Lo que se espera a la red. El mismo límite que la nube: 4 s y a lo guardado. */
const ESPERA_MS = 4000;

/**
 * La ventana que sirve la API, medida contra ella el 28 de agosto de 2026: pedir
 * enero de 2027 contesta «allowed range from 2026-05-27 to 2026-09-12». Son 92
 * días hacia atrás y 16 hacia delante.
 *
 * Hay que respetarla al construir la petición, y no es un detalle: **una sola
 * fecha fuera de rango tumba la petición entera**, no solo ese día. Por eso se
 * piden únicamente los días que caben y los demás se declaran sin predicción.
 */
export const HORIZONTE = 16;
export const RETROSPECTIVA = 92;

/** A partir de aquí un día se cuenta como día de lluvia en el resumen. */
export const UMBRAL_LLUVIA = 30;

/**
 * Códigos WMO en español. **Escritos, no traducidos**: «Nubes y claros» es lo
 * que dice un parte del tiempo aquí, y «parcialmente nublado» es el calco del
 * `partly cloudy` de la tabla original.
 *
 * `moja` es lo único que se consulta como dato y no como texto: es lo que hace
 * que un día de llovizna cuente como día de lluvia aunque la probabilidad
 * máxima se quede por debajo del umbral.
 */
const CIELO = {
  0:  { texto: 'Despejado',              icono: 'sol' },
  1:  { texto: 'Casi despejado',         icono: 'nuboso' },
  2:  { texto: 'Nubes y claros',         icono: 'nuboso' },
  3:  { texto: 'Cubierto',               icono: 'cubierto' },
  45: { texto: 'Niebla',                 icono: 'niebla' },
  48: { texto: 'Niebla helada',          icono: 'niebla' },
  51: { texto: 'Llovizna débil',         icono: 'lluvia',   moja: true },
  53: { texto: 'Llovizna',               icono: 'lluvia',   moja: true },
  55: { texto: 'Llovizna fuerte',        icono: 'lluvia',   moja: true },
  56: { texto: 'Llovizna helada',        icono: 'lluvia',   moja: true },
  57: { texto: 'Llovizna helada fuerte', icono: 'lluvia',   moja: true },
  61: { texto: 'Lluvia débil',           icono: 'lluvia',   moja: true },
  63: { texto: 'Lluvia',                 icono: 'lluvia',   moja: true },
  65: { texto: 'Lluvia fuerte',          icono: 'lluvia',   moja: true },
  66: { texto: 'Lluvia helada',          icono: 'lluvia',   moja: true },
  67: { texto: 'Lluvia helada fuerte',   icono: 'lluvia',   moja: true },
  71: { texto: 'Nieve débil',            icono: 'nieve',    moja: true },
  73: { texto: 'Nieve',                  icono: 'nieve',    moja: true },
  75: { texto: 'Nieve fuerte',           icono: 'nieve',    moja: true },
  77: { texto: 'Granos de nieve',        icono: 'nieve',    moja: true },
  80: { texto: 'Chubascos aislados',     icono: 'chubasco', moja: true },
  81: { texto: 'Chubascos',              icono: 'chubasco', moja: true },
  82: { texto: 'Chubascos fuertes',      icono: 'chubasco', moja: true },
  85: { texto: 'Chubascos de nieve',     icono: 'nieve',    moja: true },
  86: { texto: 'Nevadas fuertes',        icono: 'nieve',    moja: true },
  95: { texto: 'Tormenta',               icono: 'tormenta', moja: true },
  96: { texto: 'Tormenta con granizo',   icono: 'tormenta', moja: true },
  99: { texto: 'Tormenta con granizo',   icono: 'tormenta', moja: true },
};

const SIN_CIELO = { texto: 'Sin dato', icono: 'practico' };

/** Qué cielo es un código WMO. Nunca devuelve `undefined`. */
export const describirCielo = (codigo) => CIELO[codigo] ?? SIN_CIELO;

// --- Dónde está cada día --------------------------------------------------

const media = (ns) => ns.reduce((s, n) => s + n, 0) / ns.length;

/**
 * Cuatro decimales son ~11 m. Más precisión no cambia la respuesta —la API
 * trabaja sobre una malla de 1-2 km— y sí cambiaría la URL, que es lo que
 * identifica a la caché.
 */
const r4 = (n) => Math.round(n * 1e4) / 1e4;

/**
 * Las zonas del día, en el orden en que se recorren.
 *
 * Se corta en dos: «Astorga y Maragatería» cabe en una fila y describe el día;
 * la lista entera de un día que cruza cuatro comarcas no cabe y tampoco dice
 * más de lo que dice el número.
 */
function unirZonas(lugares) {
  const zonas = [...new Set(lugares.map((l) => l.zona).filter(Boolean))];
  if (!zonas.length) return '';
  if (zonas.length === 1) return zonas[0];
  if (zonas.length === 2) return `${zonas[0]} y ${zonas[1]}`;
  return `${zonas[0]} y ${zonas.length - 1} zonas más`;
}

/**
 * Las horas que el día está en marcha, para no traer las veinticuatro.
 *
 * Se saca de los bloques y no de un horario fijo: el sábado se llega a las
 * 21:00 y las tres de la tarde de ese día no le importan a nadie. Una hora de
 * margen por cada lado, porque salir es antes de la primera parada.
 *
 * Los finales que cruzan medianoche se descartan: un bloque de 21:30 a 00:00
 * daría `fin` 0 y arrastraría la franja al principio del día.
 */
export function franjaDelDia(dia) {
  const minutos = [];
  for (const b of dia?.bloques || []) {
    const i = aMinutos(b.inicio);
    const f = aMinutos(b.fin);
    if (Number.isFinite(i)) minutos.push(i);
    if (Number.isFinite(f) && (!Number.isFinite(i) || f > i)) minutos.push(f);
  }
  if (!minutos.length) return [8, 21];
  const desde = Math.max(5, Math.floor(Math.min(...minutos) / 60) - 1);
  const hasta = Math.min(23, Math.ceil(Math.max(...minutos) / 60) + 1);
  return [desde, Math.max(hasta, desde + 3)];
}

/**
 * Un punto por día: dónde se pide el tiempo y cómo se llama ese sitio.
 *
 * Un día sin paradas —los que `datos.js` rellena como «Sin plan»— cae al centro
 * del mapa del viaje. Es lo honesto: el día existe en la barra, así que su
 * tiempo también tiene que existir.
 */
export function puntosDelViaje(viaje) {
  return (viaje?.dias || []).map((dia) => {
    const lugares = (dia.paradas || []).map((p) => p.lugar).filter((l) => l?.coords);
    const franja = franjaDelDia(dia);

    if (!lugares.length) {
      const centro = viaje.mapa?.centro;
      if (!centro) return null;
      return { fecha: dia.fecha, lat: r4(centro[0]), lon: r4(centro[1]), etiqueta: viaje.base || '', franja };
    }

    return {
      fecha: dia.fecha,
      lat: r4(media(lugares.map((l) => l.coords[0]))),
      lon: r4(media(lugares.map((l) => l.coords[1]))),
      etiqueta: unirZonas(lugares),
      franja,
    };
  }).filter(Boolean);
}

/**
 * Qué se puede saber de una fecha: `prevision`, `lejano` (todavía no hay) o
 * `antiguo` (ya no se guarda). `dias` es la distancia con signo hasta hoy.
 */
export function alcanceDeFecha(fecha, hoy = aIso(new Date())) {
  const dias = Math.round((aFecha(fecha) - aFecha(hoy)) / 86400000);
  if (dias > HORIZONTE) return { estado: 'lejano', dias };
  if (dias < -RETROSPECTIVA) return { estado: 'antiguo', dias };
  return { estado: 'prevision', dias };
}

// --- Caché ----------------------------------------------------------------

/**
 * Identifica el itinerario que generó estos datos. Si mueves una parada, el
 * centroide de su día cambia y esta clave deja de coincidir: lo guardado se
 * sigue enseñando —vale más que un hueco— pero se vuelve a pedir en el acto.
 */
const claveDe = (puntos) => puntos.map((p) => `${p.fecha}@${p.lat},${p.lon}`).join('|');

/** Lo último que llegó, sin tocar la red. Síncrono para poder pintar con ello. */
export function tiempoGuardado(viajeId) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const bruto = localStorage.getItem(`${CLAVE}:${viajeId}`);
    if (!bruto) return null;
    const dato = JSON.parse(bruto);
    return dato?.dias ? dato : null;
  } catch {
    return null;
  }
}

function guardar(viajeId, dato) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${CLAVE}:${viajeId}`, JSON.stringify(dato));
  } catch (e) {
    console.warn('No se ha podido guardar el tiempo:', e.message);
  }
}

export function olvidarTiempo(viajeId) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(`${CLAVE}:${viajeId}`); } catch { /* nada que borrar */ }
}

// --- Petición -------------------------------------------------------------

/** La URL de una tanda de puntos. Aparte para poder probarla sin red. */
export function urlDeConsulta(puntos, desde, hasta) {
  const url = new URL(API);
  url.searchParams.set('latitude', puntos.map((p) => p.lat).join(','));
  url.searchParams.set('longitude', puntos.map((p) => p.lon).join(','));
  url.searchParams.set('daily', [
    'weather_code', 'temperature_2m_max', 'temperature_2m_min',
    'precipitation_probability_max', 'precipitation_sum', 'wind_speed_10m_max',
    'sunrise', 'sunset',
  ].join(','));
  url.searchParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code');
  // `auto` y no una zona fija: resuelve por localidad, así que un viaje que
  // cruce un huso sigue diciendo la hora del sitio donde estás.
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('start_date', desde);
  url.searchParams.set('end_date', hasta);
  return url.toString();
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const hhmm = (v) => (typeof v === 'string' && v.length >= 16 ? v.slice(11, 16) : '');

/**
 * La respuesta cruda a un día por fecha.
 *
 * Con una sola localidad Open-Meteo devuelve un objeto y con varias un array;
 * se normaliza a array siempre. Cada localidad trae el rango entero de fechas y
 * de ahí se coge **solo su día**: el resto son las mismas fechas en un sitio
 * donde ese día no se está.
 */
export function normalizarRespuesta(bruto, puntos) {
  const lista = Array.isArray(bruto) ? bruto : [bruto];
  const dias = {};

  puntos.forEach((punto, i) => {
    const loc = lista[i];
    const d = loc?.daily;
    const j = d?.time?.indexOf(punto.fecha) ?? -1;
    if (j < 0) return;

    const [h1, h2] = punto.franja || [8, 21];
    const horas = [];
    const th = loc.hourly?.time || [];
    for (let k = 0; k < th.length; k += 1) {
      if (!String(th[k]).startsWith(punto.fecha)) continue;
      const h = Number(String(th[k]).slice(11, 13));
      if (h < h1 || h > h2) continue;
      horas.push({
        h,
        t: Math.round(loc.hourly.temperature_2m?.[k] ?? 0),
        p: num(loc.hourly.precipitation_probability?.[k]),
        c: loc.hourly.weather_code?.[k] ?? null,
      });
    }

    dias[punto.fecha] = {
      codigo: d.weather_code?.[j] ?? null,
      max: num(d.temperature_2m_max?.[j]),
      min: num(d.temperature_2m_min?.[j]),
      lluvia: num(d.precipitation_probability_max?.[j]),
      mm: num(d.precipitation_sum?.[j]),
      viento: num(d.wind_speed_10m_max?.[j]),
      amanecer: hhmm(d.sunrise?.[j]),
      atardecer: hhmm(d.sunset?.[j]),
      altitud: num(loc.elevation) === null ? null : Math.round(loc.elevation),
      etiqueta: punto.etiqueta,
      horas,
    };
  });

  return dias;
}

async function traer(url) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPERA_MS);
  try {
    const res = await fetch(url, { signal: control.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    const dato = await res.json();
    // La API contesta 200 con `{error: true, reason}` en algunos casos.
    if (dato && !Array.isArray(dato) && dato.error) throw new Error(dato.reason || 'error de la API');
    return dato;
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Trae el tiempo del viaje si hace falta, y devuelve **siempre** lo mejor que
 * hay: lo nuevo si llegó, lo guardado si no, `null` si nunca hubo nada.
 *
 * No lanza. Un fallo de red aquí no es un error de la aplicación: es un día sin
 * predicción, y se dice enseñando la fecha de lo que se está viendo.
 */
export async function actualizarTiempo(viaje) {
  const guardado = tiempoGuardado(viaje?.id);
  const puntos = puntosDelViaje(viaje);
  const pedibles = puntos.filter((p) => alcanceDeFecha(p.fecha).estado === 'prevision');
  if (!pedibles.length) return guardado;

  const clave = claveDe(puntos);
  const alDia = guardado
    && guardado.clave === clave
    && Date.now() - (guardado.generado || 0) < FRESCO_MS;
  if (alDia) return guardado;

  const fechas = pedibles.map((p) => p.fecha).sort();
  try {
    const bruto = await traer(urlDeConsulta(pedibles, fechas[0], fechas[fechas.length - 1]));
    const dias = normalizarRespuesta(bruto, pedibles);
    if (!Object.keys(dias).length) return guardado;
    const nuevo = { version: 1, clave, generado: Date.now(), dias };
    guardar(viaje.id, nuevo);
    return nuevo;
  } catch (e) {
    console.warn('El tiempo no ha llegado:', e.message);
    return guardado;
  }
}

// --- Lecturas para las vistas ---------------------------------------------

/** El tiempo de un día concreto, o `null`. */
export const tiempoDelDia = (tiempo, fecha) => tiempo?.dias?.[fecha] || null;

/** Si un día cuenta como día de lluvia: por probabilidad o por el propio cielo. */
export const esDiaDeAgua = (t) =>
  Boolean(t) && ((t.lluvia ?? 0) >= UMBRAL_LLUVIA || describirCielo(t.codigo).moja === true);

/**
 * El viaje entero de un vistazo: extremos, cuántos días mojan y cuántos días
 * siguen sin predicción. `faltan` es lo que evita que el resumen mienta cuando
 * solo han llegado dos días de seis.
 */
export function resumenDelTiempo(tiempo, viaje) {
  const todos = viaje?.dias || [];
  const conDato = todos.map((d) => tiempoDelDia(tiempo, d.fecha)).filter(Boolean);
  if (!conDato.length) return null;

  const maximas = conDato.map((t) => t.max).filter((n) => n !== null);
  const minimas = conDato.map((t) => t.min).filter((n) => n !== null);

  return {
    cuantos: conDato.length,
    faltan: todos.length - conDato.length,
    max: maximas.length ? Math.max(...maximas) : null,
    min: minimas.length ? Math.min(...minimas) : null,
    agua: conDato.filter(esDiaDeAgua).length,
  };
}

/**
 * Cuánto hace que llegó el dato. En pasos gruesos a propósito: aquí lo que se
 * pregunta es «¿esto es de hoy?», no cuántos minutos exactos tiene.
 */
export function desdeCuando(generado, ahora = Date.now()) {
  if (!generado) return '';
  const min = Math.max(0, Math.round((ahora - generado) / 60000));
  if (min < 2) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}
