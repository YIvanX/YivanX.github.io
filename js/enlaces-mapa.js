/**
 * Enlaces a Google Maps.
 *
 * Dos cosas distintas y las dos hacen falta:
 *
 *  · El enlace de **un sitio**, para abrirlo en el móvil y navegar hasta él.
 *  · El enlace de **un día entero**, con todas las paradas en el orden real del
 *    recorrido. Es lo que se manda por WhatsApp la noche antes.
 *
 * Todo sale de las coordenadas, nunca del nombre: buscar «Catedral de León» por
 * texto es exactamente lo que devolvió la catedral de Burgos al montar este
 * viaje. Con `lat,lng` no hay ambigüedad posible.
 */

const BASE = 'https://www.google.com/maps';

/** Tope de la API de URLs de Google: origen + 9 intermedios + destino. */
const MAX_PUNTOS_API = 11;

const aCoord = (lugar) => `${lugar.coords[0]},${lugar.coords[1]}`;

const MODO_GOOGLE = {
  'a-pie': 'walking',
  bici: 'bicycling',
  tren: 'transit',
  bus: 'transit',
  taxi: 'driving',
  coche: 'driving',
};

/** Ver el sitio en el mapa, con su ficha de Google si la tiene. */
export function enlaceLugar(lugar) {
  if (!lugar?.coords) return null;
  return `${BASE}/search/?api=1&query=${aCoord(lugar)}`;
}

/** Indicaciones hasta el sitio desde donde esté quien lo abra. */
export function enlaceComoLlegar(lugar, modo) {
  if (!lugar?.coords) return null;
  const google = MODO_GOOGLE[modo];
  return `${BASE}/dir/?api=1&destination=${aCoord(lugar)}${google ? `&travelmode=${google}` : ''}`;
}

/**
 * Un tramo suelto: de un sitio al siguiente, con su modo.
 *
 * Es lo que se abre andando por una ciudad — no «cómo llego a San Isidoro desde
 * donde estoy», sino «cómo se va de la catedral a San Isidoro», que es el dato
 * que está en el itinerario.
 */
export function enlaceTramo(desde, hasta, modo) {
  if (!desde?.coords || !hasta?.coords) return null;
  const google = MODO_GOOGLE[modo];
  return `${BASE}/dir/?api=1&origin=${aCoord(desde)}&destination=${aCoord(hasta)}`
    + (google ? `&travelmode=${google}` : '');
}

/**
 * La cadena real de puntos de un día, en orden.
 *
 * Recorre los bloques tal y como están e incluye también los extremos de los
 * traslados —las estaciones—, porque sin ellas la ruta no se entiende: el
 * miércoles no se va de León a Las Médulas, se va a la estación, luego a
 * Ponferrada, y desde allí en taxi.
 *
 * Se quitan las repeticiones **consecutivas**: un traslado que sale de donde
 * acabó el bloque anterior no añade una parada nueva. Las repeticiones no
 * consecutivas sí cuentan — volver a comer donde se estuvo por la mañana es una
 * parada más del recorrido.
 */
export function puntosDelDia(dia) {
  const cadena = [];
  const empujar = (lugar) => {
    if (!lugar?.coords) return;
    if (cadena.length && cadena[cadena.length - 1].id === lugar.id) return;
    cadena.push(lugar);
  };

  for (const bloque of dia.bloques || []) {
    if (bloque.tipo === 'traslado') {
      empujar(bloque.lugarDesde);
      empujar(bloque.lugarHasta);
    } else if (bloque.lugar) {
      empujar(bloque.lugar);
    }
  }
  return cadena;
}

/**
 * Modo de transporte del día.
 * Google solo admite paradas intermedias en a pie, coche y bici — en transporte
 * público no existen—, así que un día con tren o bus cae a `driving`. Es una
 * limitación de Google, y por eso el botón dice «recorrido» y no «cómo llegar»:
 * la ruta sirve para ver el día sobre el mapa, no para que la sigas conduciendo.
 */
function modoDelDia(dia) {
  const modos = (dia.bloques || []).filter((b) => b.tipo === 'traslado' && b.modo).map((b) => b.modo);
  if (!modos.length) return 'walking';
  if (modos.every((m) => m === 'a-pie')) return 'walking';
  if (modos.every((m) => m === 'bici')) return 'bicycling';
  return 'driving';
}

/**
 * El día entero en Google Maps, con las paradas en orden.
 * @returns {?{url:string, paradas:number, modo:string, recortado:boolean}}
 */
export function rutaDelDia(dia) {
  const puntos = puntosDelDia(dia);
  if (puntos.length < 2) return null;

  const modo = modoDelDia(dia);

  if (puntos.length <= MAX_PUNTOS_API) {
    const intermedios = puntos.slice(1, -1).map(aCoord).join('%7C');
    const url = `${BASE}/dir/?api=1`
      + `&origin=${aCoord(puntos[0])}`
      + `&destination=${aCoord(puntos[puntos.length - 1])}`
      + (intermedios ? `&waypoints=${intermedios}` : '')
      + `&travelmode=${modo}`;
    return { url, paradas: puntos.length, modo, recortado: false };
  }

  // Por encima de nueve paradas intermedias, la forma con `api=1` deja de
  // admitirlas. La forma de ruta por segmentos (/dir/a/b/c/) sí las admite y es
  // la que genera el propio Google al compartir una ruta larga.
  return {
    url: `${BASE}/dir/${puntos.map(aCoord).join('/')}`,
    paradas: puntos.length,
    modo,
    recortado: false,
  };
}

/** Todas las rutas del viaje, para exportarlas o pegarlas en otro sitio. */
export function rutasDelViaje(viaje) {
  return viaje.dias
    .map((dia) => ({ fecha: dia.fecha, titulo: dia.titulo, ...(rutaDelDia(dia) || {}) }))
    .filter((r) => r.url);
}
