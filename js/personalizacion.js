/**
 * Capa personal sobre un viaje: paradas añadidas y paradas ocultadas.
 *
 * **El JSON del viaje no se toca nunca.** Lo que se añade y lo que se quita
 * vive en el navegador, como los visitados y las notas, y se superpone al
 * cargar. Tres razones:
 *
 *  · Es un sitio estático: no hay backend que pueda escribir en el repositorio.
 *  · Quitar es **ocultar**, no borrar. Se puede restaurar, y una edición futura
 *    del JSON no entra en conflicto con lo que hiciste sobre la marcha.
 *  · Funciona sin conexión, igual que el resto del estado personal.
 *
 * Cuando un cambio merezca ser permanente, se exporta desde la aplicación y se
 * pega en el JSON del viaje. Ese es el puente entre lo efímero y el repositorio.
 *
 * Este módulo es **puro**: no toca el DOM ni localStorage, y por eso se puede
 * probar entero en Node. Toda la lógica que decide qué se ve vive aquí.
 */

export const VERSION_CAPA = 1;

export const capaVacia = () => ({ version: VERSION_CAPA, lugares: [], bloques: [], ocultos: [] });

/**
 * Identidad estable de un bloque del JSON base.
 *
 * NO se usa el índice: en cuanto se añade una parada a mitad del día, los
 * índices se corren y lo ocultado saltaría a otro bloque. Se usa fecha + hora +
 * a qué apunta, que sobrevive a inserciones y a reordenar.
 */
export function claveEstable(fecha, bloque) {
  const que = bloque.lugar
    || (bloque.desde && bloque.hasta ? `${bloque.desde}>${bloque.hasta}` : '')
    || bloque.titulo
    || '';
  return `${fecha}|${bloque.inicio || ''}|${bloque.tipo || 'visita'}|${que}`;
}

/** Identificador único para algo creado en el navegador. */
export const nuevoId = (prefijo = 'propio') =>
  `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Convierte texto libre en un id en kebab-case que no choque con los que ya hay. */
export function idDesdeNombre(nombre, usados = new Set()) {
  const base = String(nombre || 'lugar')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'lugar';
  if (!usados.has(base)) return base;
  for (let i = 2; i < 200; i += 1) {
    if (!usados.has(`${base}-${i}`)) return `${base}-${i}`;
  }
  return `${base}-${nuevoId()}`;
}

const CATEGORIAS_VALIDAS = ['patrimonio', 'naturaleza', 'comida', 'pueblo', 'transporte', 'alojamiento', 'practico'];

/**
 * Adivina la categoría a partir de las etiquetas de OpenStreetMap.
 * Falla hacia `practico`, que es el cajón neutro: nunca inventa una categoría
 * que pinte de color algo que no se sabe qué es.
 */
export function categoriaDesdeOsm(clave, valor) {
  const v = String(valor || '').toLowerCase();
  const k = String(clave || '').toLowerCase();
  if (['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'winery', 'ice_cream', 'bakery'].includes(v)) return 'comida';
  if (['hotel', 'hostel', 'guest_house', 'apartment', 'motel', 'camp_site'].includes(v)) return 'alojamiento';
  if (['station', 'bus_stop', 'aerodrome', 'ferry_terminal', 'parking', 'halt'].includes(v)) return 'transporte';
  if (k === 'tourism' && ['museum', 'artwork', 'gallery', 'attraction'].includes(v)) return 'patrimonio';
  if (['castle', 'church', 'cathedral', 'monastery', 'ruins', 'monument', 'memorial', 'archaeological_site', 'chapel'].includes(v)) return 'patrimonio';
  if (k === 'historic') return 'patrimonio';
  if (['viewpoint', 'peak', 'cave_entrance', 'water', 'wood', 'nature_reserve', 'beach', 'spring', 'waterfall', 'cliff'].includes(v)) return 'naturaleza';
  if (k === 'natural' || k === 'leisure') return 'naturaleza';
  if (['city', 'town', 'village', 'hamlet', 'suburb', 'square'].includes(v)) return 'pueblo';
  return 'practico';
}

/**
 * Un resultado del buscador de mapas convertido en lugar del viaje.
 * @param {{nombre:string, coords:[number,number], zona?:string, osm?:{clave:string,valor:string}, fuente?:string}} r
 */
export function lugarDesdeBusqueda(r, usados = new Set()) {
  if (!r?.nombre || !Array.isArray(r.coords) || r.coords.length !== 2) {
    throw new Error('El resultado necesita nombre y coordenadas');
  }
  const [lat, lon] = r.coords.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('Coordenadas fuera de rango');
  }
  const categoria = CATEGORIAS_VALIDAS.includes(r.categoria)
    ? r.categoria
    : categoriaDesdeOsm(r.osm?.clave, r.osm?.valor);

  return {
    id: idDesdeNombre(r.nombre, usados),
    nombre: String(r.nombre).slice(0, 120),
    categoria,
    ...(r.zona ? { zona: String(r.zona).slice(0, 80) } : {}),
    coords: [Number(lat.toFixed(5)), Number(lon.toFixed(5))],
    resumen: r.resumen ? String(r.resumen).slice(0, 220) : 'Añadido durante el viaje.',
    origen: 'propio',
    verificado: { fecha: new Date().toISOString().slice(0, 10), fuente: r.fuente || 'Añadido a mano en la aplicación' },
  };
}

/** Ordena por hora de inicio; lo que no tiene hora se queda donde está. */
function ordenarPorHora(bloques) {
  return bloques
    .map((b, i) => ({ b, i }))
    .sort((x, y) => {
      const hx = x.b.inicio || '';
      const hy = y.b.inicio || '';
      if (hx && hy && hx !== hy) return hx.localeCompare(hy);
      if (hx && !hy) return -1;
      if (!hx && hy) return 1;
      return x.i - y.i;
    })
    .map((x) => x.b);
}

/**
 * Superpone la capa personal sobre el viaje.
 *
 * Devuelve un objeto **nuevo**: el viaje original no se toca, para que volver a
 * aplicar una capa distinta parta siempre de lo mismo.
 *
 * @returns {{viaje:object, resumen:{anadidos:number, ocultos:number, lugares:number}}}
 */
export function aplicarCapa(viaje, capa) {
  const c = { ...capaVacia(), ...(capa || {}) };
  const ocultos = new Set(c.ocultos || []);

  const lugaresPropios = (c.lugares || []).map((l) => ({ ...l, origen: 'propio' }));
  const idsBase = new Set((viaje.lugares || []).map((l) => l.id));
  // Un lugar propio que choque con uno del JSON se descarta: manda el archivo.
  const propiosSinChoque = lugaresPropios.filter((l) => !idsBase.has(l.id));

  const porFecha = new Map();
  for (const b of c.bloques || []) {
    if (!porFecha.has(b.fecha)) porFecha.set(b.fecha, []);
    porFecha.get(b.fecha).push(b);
  }

  let anadidos = 0;
  let escondidos = 0;

  const dias = (viaje.dias || []).map((dia) => {
    const base = (dia.bloques || []).filter((b) => {
      const fuera = ocultos.has(claveEstable(dia.fecha, b));
      if (fuera) escondidos += 1;
      return !fuera;
    });

    const propios = (porFecha.get(dia.fecha) || []).map((b) => {
      anadidos += 1;
      return {
        tipo: b.tipo || 'visita',
        inicio: b.inicio,
        ...(b.fin ? { fin: b.fin } : {}),
        lugar: b.lugar,
        ...(b.nota ? { nota: b.nota } : {}),
        propio: true,
        idPropio: b.id,
      };
    });

    return { ...dia, bloques: ordenarPorHora([...base, ...propios]) };
  });

  return {
    viaje: {
      ...viaje,
      lugares: [...(viaje.lugares || []), ...propiosSinChoque],
      dias,
    },
    resumen: { anadidos, ocultos: escondidos, lugares: propiosSinChoque.length },
  };
}

/** Cuántos bloques se han ocultado en un día concreto. */
export function ocultosDelDia(viajeBase, capa, fecha) {
  const ocultos = new Set(capa?.ocultos || []);
  const dia = (viajeBase.dias || []).find((d) => d.fecha === fecha);
  if (!dia) return [];
  return (dia.bloques || []).filter((b) => ocultos.has(claveEstable(fecha, b)));
}

/**
 * Revisa una capa antes de guardarla o importarla.
 * Devuelve la lista de problemas; vacía significa que se puede guardar.
 */
export function validarCapa(capa) {
  const fallos = [];
  if (!capa || typeof capa !== 'object') return ['la capa no es un objeto'];
  if (!Array.isArray(capa.lugares)) fallos.push('lugares debe ser una lista');
  if (!Array.isArray(capa.bloques)) fallos.push('bloques debe ser una lista');
  if (!Array.isArray(capa.ocultos)) fallos.push('ocultos debe ser una lista');

  const ids = new Set();
  for (const [i, l] of (capa.lugares || []).entries()) {
    if (!l?.id) { fallos.push(`lugares[${i}] sin id`); continue; }
    if (ids.has(l.id)) fallos.push(`lugares[${i}] id repetido: ${l.id}`);
    ids.add(l.id);
    if (!l.nombre) fallos.push(`lugares[${i}] sin nombre`);
    if (!Array.isArray(l.coords) || l.coords.length !== 2) fallos.push(`lugares[${i}] sin coordenadas`);
    if (!CATEGORIAS_VALIDAS.includes(l.categoria)) fallos.push(`lugares[${i}] categoría no válida: ${l.categoria}`);
  }
  for (const [i, b] of (capa.bloques || []).entries()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b?.fecha || '')) fallos.push(`bloques[${i}] fecha no válida`);
    if (!b?.lugar) fallos.push(`bloques[${i}] sin lugar`);
    else if (!ids.has(b.lugar) && !b.lugarBase) fallos.push(`bloques[${i}] apunta a un lugar propio que no existe: ${b.lugar}`);
    if (b?.inicio && !/^([01]\d|2[0-4]):[0-5]\d$/.test(b.inicio)) fallos.push(`bloques[${i}] hora no válida: ${b.inicio}`);
  }
  return fallos;
}

/**
 * Lo añadido, con la forma que tiene un lugar en el JSON del viaje, para poder
 * pegarlo y hacerlo permanente. Es el puente entre la capa y el repositorio.
 */
export function comoJsonDelViaje(capa) {
  const limpio = (l) => {
    const { origen, ...resto } = l;
    return resto;
  };
  return {
    lugares: (capa?.lugares || []).map(limpio),
    bloquesPorDia: (capa?.bloques || []).reduce((acc, b) => {
      (acc[b.fecha] ||= []).push({
        inicio: b.inicio,
        ...(b.fin ? { fin: b.fin } : {}),
        lugar: b.lugar,
        ...(b.nota ? { nota: b.nota } : {}),
      });
      return acc;
    }, {}),
    ocultos: capa?.ocultos || [],
  };
}
