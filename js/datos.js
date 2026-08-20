/**
 * Carga y normaliza los datos. Aquí es donde el JSON se convierte en algo que
 * las vistas pueden pintar sin volver a recorrerlo entero cada vez.
 */

import { estadoPorFecha, diasEntre, aIso } from './horarios.js';

const cache = new Map();

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

  const viaje = normalizar(await traer(entrada.archivo || `data/viajes/${id}.json`), entrada);
  cache.set(`viaje:${id}`, viaje);
  return viaje;
}

function normalizar(viaje, entrada) {
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

export const ESTADOS_VIAJE = {
  planificado: { etiqueta: 'Planificado', clase: '' },
  'en-curso':  { etiqueta: 'En curso',    clase: 'chip--ok' },
  completado:  { etiqueta: 'Completado',  clase: 'chip--alerta' },
};
