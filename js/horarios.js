/**
 * Horarios: ¿está abierto este lugar, este día, a esta hora?
 *
 * Este módulo lo usan las dos puntas del sistema — el validador de Node y la
 * aplicación en el navegador — a propósito. Si la respuesta se calculara en dos
 * sitios, un día dirían cosas distintas y el error aparecería estando allí.
 *
 * No toca el DOM ni depende de nada. No añadir imports.
 */

/** Índice 0..6 igual que Date#getDay(), que empieza en domingo. */
export const CLAVES_DIA = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

export const NOMBRE_DIA = {
  lun: 'lunes', mar: 'martes', mie: 'miércoles', jue: 'jueves',
  vie: 'viernes', sab: 'sábado', dom: 'domingo',
};

export const NOMBRE_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Convierte "AAAA-MM-DD" en un Date **local**.
 * `new Date("2026-08-30")` lo interpreta como UTC y en España devuelve el día
 * anterior a partir de cierta hora. Ese error desplazaría el itinerario entero
 * un día, así que se construye a mano.
 */
export function aFecha(iso) {
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(a, m - 1, d);
}

/** "AAAA-MM-DD" → "lun" | "mar" | … */
export function claveDia(iso) {
  return CLAVES_DIA[aFecha(iso).getDay()];
}

/** Date → "AAAA-MM-DD" en horario local. */
export function aIso(fecha) {
  const p = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

/** "HH:MM" → minutos desde medianoche. Devuelve NaN si no encaja. */
export function aMinutos(hhmm) {
  const m = /^([01]\d|2[0-4]):([0-5]\d)$/.exec(String(hhmm ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** Minutos desde medianoche → "HH:MM". */
export function aHora(minutos) {
  const m = ((minutos % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Normaliza las franjas de un día a pares de minutos, resolviendo el cruce de
 * medianoche: ["19:30","00:00"] se convierte en 1170..1440, no en 1170..0.
 */
function normalizarFranjas(franjas) {
  return (franjas || []).map(([desde, hasta]) => {
    const a = aMinutos(desde);
    let b = aMinutos(hasta);
    if (b <= a) b += 1440;
    return [a, b];
  });
}

/**
 * Franjas de apertura de un lugar en una fecha.
 * `null` significa «sin horario declarado», que no es lo mismo que cerrado:
 * una plaza o una muralla no tienen horario y están siempre accesibles.
 */
export function franjasDe(lugar, iso) {
  if (!lugar || !lugar.horarios) return null;
  return normalizarFranjas(lugar.horarios[claveDia(iso)]);
}

/**
 * Estado de un lugar en un instante.
 * @returns {{estado:'sin-horario'|'cerrado-hoy'|'abierto'|'cerrado', abre:?number, cierra:?number}}
 *   estado 'cerrado-hoy' = no abre en todo el día (el caso que rompe itinerarios).
 *   estado 'cerrado'     = abre hoy, pero no a esta hora.
 */
export function estadoEn(lugar, iso, minutos) {
  const franjas = franjasDe(lugar, iso);
  if (franjas === null) return { estado: 'sin-horario', abre: null, cierra: null };
  if (franjas.length === 0) return { estado: 'cerrado-hoy', abre: null, cierra: null };

  for (const [a, b] of franjas) {
    if (minutos >= a && minutos < b) return { estado: 'abierto', abre: a, cierra: b };
  }
  const siguiente = franjas.find(([a]) => a > minutos);
  return {
    estado: 'cerrado',
    abre: siguiente ? siguiente[0] : franjas[0][0],
    cierra: siguiente ? siguiente[1] : franjas[0][1],
  };
}

/** Texto corto del horario de un día: "10:00–14:00 · 16:00–19:00" o "cerrado". */
export function textoHorario(lugar, iso) {
  const franjas = franjasDe(lugar, iso);
  if (franjas === null) return 'Sin horario: acceso libre';
  if (franjas.length === 0) return 'Cerrado';
  return franjas.map(([a, b]) => `${aHora(a)}–${aHora(b)}`).join(' · ');
}

/**
 * Comprueba un bloque de visita contra el horario del lugar.
 * Es la función que caza el error de planificación antes de que lo cace el viaje.
 *
 * @returns {{nivel:'ok'|'aviso'|'error', mensaje:string}}
 */
export function revisarBloque(lugar, iso, bloque) {
  const inicio = aMinutos(bloque.inicio);
  if (!lugar || Number.isNaN(inicio)) return { nivel: 'ok', mensaje: '' };

  // Un bloque "exterior" es ver la fachada, el mirador o el edificio iluminado de
  // noche. No entra, así que el horario de taquilla no le aplica.
  if (bloque.exterior) return { nivel: 'ok', mensaje: '' };

  const franjas = franjasDe(lugar, iso);
  if (franjas === null) return { nivel: 'ok', mensaje: '' };

  const dia = NOMBRE_DIA[claveDia(iso)];
  if (franjas.length === 0) {
    return { nivel: 'error', mensaje: `${lugar.nombre} cierra los ${dia}` };
  }

  const dentro = franjas.some(([a, b]) => inicio >= a && inicio < b);
  if (!dentro) {
    return {
      nivel: 'error',
      mensaje: `${lugar.nombre} no está abierto a las ${bloque.inicio} (${textoHorario(lugar, iso)})`,
    };
  }

  // Empieza dentro pero termina fuera: se llega a tiempo y te echan a media visita.
  const fin = aMinutos(bloque.fin);
  if (!Number.isNaN(fin)) {
    const franja = franjas.find(([a, b]) => inicio >= a && inicio < b);
    const finReal = fin <= inicio ? fin + 1440 : fin;
    if (finReal > franja[1]) {
      return {
        nivel: 'aviso',
        mensaje: `${lugar.nombre} cierra a las ${aHora(franja[1])} y el bloque llega hasta las ${bloque.fin}`,
      };
    }
  }

  return { nivel: 'ok', mensaje: '' };
}

/** Días entre dos fechas ISO, ambas incluidas. */
export function diasEntre(desdeIso, hastaIso) {
  const salida = [];
  const fin = aFecha(hastaIso);
  for (let d = aFecha(desdeIso); d <= fin; d.setDate(d.getDate() + 1)) {
    salida.push(aIso(d));
  }
  return salida;
}

/** "sábado, 29 de agosto" */
export function fechaLarga(iso) {
  const f = aFecha(iso);
  return `${NOMBRE_DIA[claveDia(iso)]}, ${f.getDate()} de ${NOMBRE_MES[f.getMonth()]}`;
}

/** Estado del viaje según el día de hoy: 'planificado' | 'en-curso' | 'completado'. */
export function estadoPorFecha(fechas, hoyIso = aIso(new Date())) {
  if (hoyIso < fechas.inicio) return 'planificado';
  if (hoyIso > fechas.fin) return 'completado';
  return 'en-curso';
}
