/**
 * Carga y normaliza los datos. Aquí es donde el JSON se convierte en algo que
 * las vistas pueden pintar sin volver a recorrerlo entero cada vez.
 */

import { estadoPorFecha, diasEntre, aIso } from './horarios.js';
import { aplicarCapa, capaVacia, claveEstable } from './personalizacion.js';
import { capaDe, guardarCapa } from './estado.js';
import * as sincronizacion from './sincronizacion.js';

const cache = new Map();

/**
 * Versión que tenía el viaje en la nube la última vez que se leyó. Es lo que se
 * manda al guardar para que quien llegue segundo reciba conflicto en vez de
 * pisarle el trabajo al otro. `null` significa «este viaje no está en la nube».
 */
const versiones = new Map();
export const versionNubeDe = (id) => versiones.get(id) ?? null;
export const fijarVersionNube = (id, v) => versiones.set(id, v);

/**
 * De dónde salió el viaje que se está viendo: `nube`, `sin-fila`, `sin-nube` o
 * `fallo`. Se guarda para poder **decirlo en pantalla**: ver una copia del
 * repositorio creyendo que es la de la nube es la forma silenciosa de que dos
 * personas trabajen sobre itinerarios distintos.
 */
const origenes = new Map();
export const origenDe = (id) => origenes.get(id) || 'sin-nube';

/**
 * La capa **tal y como está en la nube**. Es la referencia contra la que se
 * mide lo que falta por subir: sin ella, «hay cambios sin guardar» sería una
 * suposición, y lo que se enseña en cada parada sería un adorno.
 */
const capasSubidas = new Map();
export const capaSubidaDe = (id) => capasSubidas.get(id) || null;
export const fijarCapaSubida = (id, capa) => capasSubidas.set(id, structuredClone(capa));

/** Cuántos cambios del itinerario no han subido todavía. 0 si no hay nube. */
export function pendientesDe(id) {
  const subida = capasSubidas.get(id);
  if (!subida || versionNubeDe(id) === null) return 0;
  return sincronizacion.contarPendientes(capaDe(id), subida);
}

async function traer(ruta) {
  const res = await fetch(ruta, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} al cargar ${ruta}`);
  return res.json();
}

export async function cargarRegistro() {
  if (cache.has('registro')) return cache.get('registro');
  const registro = await traer('data/viajes.json');
  registro.viajes = (registro.viajes || [])
    .map((v) => ({ ...v, estadoReal: estadoPorFecha(v.fechas) }))
    .sort((a, b) => b.fechas.inicio.localeCompare(a.fechas.inicio));
  cache.set('registro', registro);
  return registro;
}

export async function cargarViaje(id) {
  if (cache.has(`viaje:${id}`)) return cache.get(`viaje:${id}`);

  const registro = await cargarRegistro();
  const entrada = registro.viajes.find((v) => v.id === id);
  if (!entrada) throw new Error(`No hay ningún viaje con el identificador "${id}"`);

  // El JSON crudo se guarda aparte: la capa se aplica siempre sobre él y nunca
  // sobre un viaje que ya tenía otra capa encima.
  //
  // **El repositorio se lee siempre, incluso habiendo nube.** Es el suelo: si
  // Supabase está pausado, caído o sin sesión, el viaje se abre igual. Lo que
  // hace la nube es sustituir ese documento cuando contesta, no ser la única vía.
  let bruto = await traer(entrada.archivo || `data/viajes/${id}.json`);

  const remoto = await sincronizacion.bajarViaje(id);
  origenes.set(id, remoto.estado === 'ok' ? 'nube' : remoto.estado);
  if (remoto.estado === 'ok' && remoto.bruto) {
    bruto = remoto.bruto;
    versiones.set(id, remoto.version);
    // Lo que hay en la nube se guarda aparte ANTES de fundir: es la foto contra
    // la que se compara después para saber qué falta por subir.
    capasSubidas.set(id, structuredClone(remoto.capa || capaVacia()));
    // La capa remota se funde con la local en vez de pisarla: lo añadido sin
    // cobertura tiene que sobrevivir a la primera carga con conexión.
    if (remoto.capa) guardarCapa(id, sincronizacion.fusionarCapas(capaDe(id), remoto.capa));
  }

  cache.set(`bruto:${id}`, bruto);

  const viaje = montar(bruto, entrada, id);
  cache.set(`viaje:${id}`, viaje);
  return viaje;
}

function montar(bruto, entrada, id) {
  const { viaje: conCapa, resumen } = aplicarCapa(bruto, capaDe(id));
  // El estado de nube se calcula aquí, con la capa delante, y viaja pegado a
  // cada bloque. La vista no tiene que saber nada de capas para pintarlo.
  const subida = versionNubeDe(id) === null ? null : capasSubidas.get(id);
  const viaje = normalizar(structuredClone(conCapa), entrada, subida);
  viaje.capa = resumen;
  viaje.pendientes = pendientesDe(id);
  return viaje;
}

/** El JSON tal y como está en el repositorio, sin capa. */
export const viajeBase = (id) => cache.get(`bruto:${id}`);

/**
 * Vuelve a montar el viaje tras cambiar la capa. Devuelve el viaje nuevo.
 * No se recarga el JSON: ya está en memoria, y así funciona sin conexión.
 */
export function recomponer(id, entrada) {
  const bruto = cache.get(`bruto:${id}`);
  if (!bruto) return null;
  const viaje = montar(bruto, entrada, id);
  cache.set(`viaje:${id}`, viaje);
  return viaje;
}

function normalizar(viaje, entrada, subida = null) {
  const porId = new Map((viaje.lugares || []).map((l) => [l.id, l]));

  // El estado que se enseña sale de la fecha de hoy, no del que está escrito en
  // el archivo: un viaje no se queda «planificado» tres semanas después de volver
  // porque a nadie se le ocurriera editar el JSON.
  viaje.estadoReal = estadoPorFecha(viaje.fechas);
  viaje.porId = porId;

  viaje.dias = (viaje.dias || []).map((dia) => {
    let orden = 0;
    const bloques = (dia.bloques || []).map((bloque, i) => {
      const tipo = bloque.tipo || 'visita';
      const lugar = tipo === 'visita' ? porId.get(bloque.lugar) : null;
      const b = { ...bloque, tipo, indice: i, lugar, clave: `${dia.fecha}#${i}` };
      // `null` cuando no hay nube o cuando el bloque no tiene ciclo de vida en
      // ella, que es el caso de casi todos: vienen del archivo y ahí siguen.
      b.nube = subida ? sincronizacion.estadoDeBloque(b, claveEstable(dia.fecha, bloque), subida) : null;
      if (tipo === 'visita' && lugar) {
        orden += 1;
        b.orden = orden;
      }
      if (tipo === 'traslado') {
        b.lugarDesde = porId.get(bloque.desde);
        b.lugarHasta = porId.get(bloque.hasta);
      }
      return b;
    });

    // Las paradas del día en orden, sin repetir: es lo que numera el mapa y lo
    // que dibuja el trazo. Un lugar visitado dos veces el mismo día se numera
    // dos veces a propósito — son dos momentos distintos del día.
    const paradas = bloques.filter((b) => b.tipo === 'visita' && b.lugar);

    return { ...dia, bloques, paradas, totalParadas: paradas.length };
  });

  viaje.lugaresUsados = [...new Set(
    viaje.dias.flatMap((d) => d.bloques.flatMap((b) =>
      b.tipo === 'visita' ? [b.lugar?.id] : [b.desde, b.hasta],
    )).filter(Boolean),
  )].map((id) => porId.get(id)).filter(Boolean);

  // Un día declarado en fechas pero sin entrada seguiría siendo un hueco en la
  // barra: se rellena para que la navegación no se salte una fecha.
  const declarados = new Set(viaje.dias.map((d) => d.fecha));
  for (const iso of diasEntre(viaje.fechas.inicio, viaje.fechas.fin)) {
    if (!declarados.has(iso)) {
      viaje.dias.push({ fecha: iso, titulo: 'Sin plan', intensidad: 'suave', bloques: [], paradas: [], totalParadas: 0, vacio: true });
    }
  }
  viaje.dias.sort((a, b) => a.fecha.localeCompare(b.fecha));

  return viaje;
}

/** El día que hay que abrir al entrar: hoy si el viaje está en curso, si no el primero. */
export function diaPorDefecto(viaje) {
  const hoy = aIso(new Date());
  return viaje.dias.find((d) => d.fecha === hoy)?.fecha || viaje.dias[0]?.fecha;
}

/** Recuadro que contiene un conjunto de lugares, con un margen. */
export function recuadroDe(lugares, margen = 0.02) {
  const puntos = lugares.map((l) => l.coords).filter(Boolean);
  if (!puntos.length) return null;
  const lats = puntos.map((p) => p[0]);
  const lons = puntos.map((p) => p[1]);
  return [
    [Math.min(...lats) - margen, Math.min(...lons) - margen],
    [Math.max(...lats) + margen, Math.max(...lons) + margen],
  ];
}

export const CATEGORIAS = {
  patrimonio:  { etiqueta: 'Patrimonio',  icono: 'patrimonio' },
  naturaleza:  { etiqueta: 'Naturaleza',  icono: 'naturaleza' },
  comida:      { etiqueta: 'Comida',      icono: 'comida' },
  pueblo:      { etiqueta: 'Pueblo',      icono: 'pueblo' },
  transporte:  { etiqueta: 'Transporte',  icono: 'transporte' },
  alojamiento: { etiqueta: 'Alojamiento', icono: 'alojamiento' },
  practico:    { etiqueta: 'Práctico',    icono: 'practico' },
};

export const MODOS = {
  'a-pie': { etiqueta: 'A pie',   icono: 'a-pie' },
  tren:    { etiqueta: 'Tren',    icono: 'tren' },
  bus:     { etiqueta: 'Bus',     icono: 'bus' },
  taxi:    { etiqueta: 'Taxi',    icono: 'taxi' },
  coche:   { etiqueta: 'Coche',   icono: 'coche' },
  barco:   { etiqueta: 'Barco',   icono: 'barco' },
  avion:   { etiqueta: 'Avión',   icono: 'avion' },
  bici:    { etiqueta: 'Bici',    icono: 'bici' },
};

/**
 * `puntos` alimenta los puntitos de la barra de días. Vive aquí y no en la
 * vista: estaba duplicado en viaje.js, y una intensidad nueva habría salido
 * bien en un sitio y mal en el otro sin que nadie se enterase.
 */
export const INTENSIDADES = {
  llegada: { etiqueta: 'Llegada',    clase: '',             puntos: 1 },
  suave:   { etiqueta: 'Suave',      clase: 'chip--ok',     puntos: 1 },
  media:   { etiqueta: 'Media',      clase: 'chip--alerta', puntos: 2 },
  fuerte:  { etiqueta: 'Día fuerte', clase: 'chip--error',  puntos: 3 },
  salida:  { etiqueta: 'Salida',     clase: '',             puntos: 1 },
};

/** Cuánto duele saltarse un sitio. Sale de las reseñas, no de mi criterio. */
export const NIVELES = {
  obligatorio:  { etiqueta: 'Obligatorio',  clase: 'nivel--obligatorio',  orden: 0 },
  recomendable: { etiqueta: 'Recomendable', clase: 'nivel--recomendable', orden: 1 },
  opcional:     { etiqueta: 'Opcional',     clase: 'nivel--opcional',     orden: 2 },
};

export const ESTADOS_VIAJE = {
  planificado: { etiqueta: 'Planificado', clase: '' },
  'en-curso':  { etiqueta: 'En curso',    clase: 'chip--ok' },
  completado:  { etiqueta: 'Completado',  clase: 'chip--alerta' },
};
