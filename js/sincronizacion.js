/**
 * El puente entre la nube y lo que se pinta: qué se baja al cargar y qué se
 * sube al cambiar.
 *
 * **La capa viaja dentro del documento, en un campo propio.** El documento que
 * guarda Supabase es el mismo JSON del repositorio más `capaCompartida`. Así el
 * viaje base sigue intacto —«quitar» sigue siendo «ocultar», y se restaura— y a
 * la vez las paradas que añades dejan de ser tuyas y pasan a ser del viaje, que
 * es lo que hace falta para compartirlo. La alternativa era aplicar la capa y
 * guardar el resultado, y eso destruye la reversibilidad: una vez aplicada, no
 * hay forma de saber qué era del archivo y qué añadiste tú.
 *
 * **La nube manda, pero nunca a costa de perder trabajo.** Al cargar se funden
 * la capa local y la remota en vez de pisar una con otra: si estuviste sin
 * cobertura añadiendo paradas, no se evaporan al volver. El precio es conocido y
 * se paga a propósito — una parada borrada en un dispositivo que no llegó a
 * subir el cambio puede reaparecer, y se vuelve a quitar. Reaparecer es un
 * incordio; desaparecer sin avisar es perder trabajo.
 *
 * Las funciones de la primera mitad son **puras**: no tocan red, ni DOM, ni
 * localStorage. Ahí vive todo lo que decide qué gana, y por eso se prueba entero
 * en Node.
 */

import * as nube from './nube.js';
import { capaVacia, validarCapa } from './personalizacion.js';

/** Campo del documento donde viaja la capa. */
export const CAMPO_CAPA = 'capaCompartida';

/**
 * Si la nube no contesta en este tiempo, se carga del repositorio y a correr.
 * Existe porque un proyecto gratuito de Supabase se pausa tras una semana sin
 * uso y la primera petición despierta al servidor: sin límite, abrir la guía el
 * día del viaje podría quedarse esperando en blanco.
 */
export const LIMITE_MS = 4000;

const ESTADO_VACIO = { visitados: {}, notas: {}, tareas: {}, vistos: {} };

// --- Puro: forma del documento --------------------------------------------

/**
 * Documento de la nube → el viaje base, la capa y la versión, por separado.
 * Una capa que no valide se descarta en vez de reventar la carga: es preferible
 * abrir el viaje sin tus añadidos que no abrirlo.
 */
export function separar(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const { [CAMPO_CAPA]: capa, versionNube, actualizadoEn, ...bruto } = doc;
  const valida = capa && validarCapa(capa).length === 0;
  if (capa && !valida) console.warn('La capa que venía de la nube no es válida y se ignora');
  return { bruto, capa: valida ? capa : null, version: versionNube ?? null };
}

/** El viaje base y la capa → el documento que se guarda en la nube. */
export function juntar(bruto, capa) {
  const { versionNube, actualizadoEn, [CAMPO_CAPA]: viejaCapa, ...limpio } = bruto || {};
  return { ...limpio, [CAMPO_CAPA]: capa || capaVacia() };
}

/**
 * Une dos capas sin perder nada de ninguna.
 *
 * Los bloques y los lugares se identifican por su `id`, que ya es estable, y lo
 * oculto es un conjunto de claves estables: las tres cosas se pueden unir sin
 * ambigüedad y el resultado no depende del orden en que se funda.
 */
export function fusionarCapas(a, b) {
  const A = { ...capaVacia(), ...(a || {}) };
  const B = { ...capaVacia(), ...(b || {}) };

  const lugares = new Map();
  for (const l of [...(A.lugares || []), ...(B.lugares || [])]) if (l?.id) lugares.set(l.id, l);

  const bloques = new Map();
  for (const x of [...(A.bloques || []), ...(B.bloques || [])]) if (x?.id) bloques.set(x.id, x);

  // Un lugar que ya no usa ningún bloque sobra: si no se limpia, la lista de
  // lugares crece para siempre a base de fundir.
  const usados = new Set([...bloques.values()].map((x) => x.lugar));

  return {
    version: Math.max(A.version || 1, B.version || 1),
    lugares: [...lugares.values()].filter((l) => usados.has(l.id)),
    bloques: [...bloques.values()],
    ocultos: [...new Set([...(A.ocultos || []), ...(B.ocultos || [])])],
  };
}

/**
 * Une el estado personal de este dispositivo con el que había en la nube.
 *
 * **En un choque gana lo local**, y no es arbitrario: el único valor que es
 * texto escrito por una persona es la nota, y reemplazar en silencio lo que
 * acabas de escribir aquí es el peor resultado posible. Lo demás son marcas de
 * hecho/no hecho, donde quién gane da igual. La nube solo rellena huecos.
 */
export function fusionarEstado(local, remoto) {
  const L = { ...ESTADO_VACIO, ...(local || {}) };
  const R = { ...ESTADO_VACIO, ...(remoto || {}) };
  const une = (l, r) => ({ ...(r || {}), ...(l || {}) });
  return {
    visitados: une(L.visitados, R.visitados),
    notas: une(L.notas, R.notas),
    tareas: une(L.tareas, R.tareas),
    vistos: une(L.vistos, R.vistos),
  };
}

/**
 * El estado de nube de un bloque del itinerario: `pendiente`, `en-nube` o
 * `null` si no tiene ninguno.
 *
 * **La mayoría de las paradas no tienen estado, y eso es intencionado.** Una
 * parada que viene del JSON del repositorio no está «subida» ni «sin subir»:
 * está en el archivo, y punto. Solo tienen ciclo de vida en la nube las dos
 * cosas que tú cambias:
 *
 *  · una parada **añadida** por ti — está en la nube o está esperando;
 *  · una parada del archivo que **restauraste** después de quitarla, si la nube
 *    todavía la tiene por quitada.
 *
 * Ponerle un icono a las 25 paradas para decir «bien» 25 veces es ruido: lo que
 * hay que ver de un vistazo es lo que falta por subir.
 *
 * @param {object} bloque    Bloque ya montado, con `propio` / `idPropio`.
 * @param {string} claveBase Su clave estable, para los que vienen del archivo.
 * @param {object} subida    La capa tal y como está en la nube.
 */
export function estadoDeBloque(bloque, claveBase, subida) {
  const s = { ...capaVacia(), ...(subida || {}) };
  if (bloque?.propio) {
    return (s.bloques || []).some((b) => b.id === bloque.idPropio) ? 'en-nube' : 'pendiente';
  }
  return (s.ocultos || []).includes(claveBase) ? 'pendiente' : null;
}

/** Cuántos cambios hay sin subir, para poder decir un número y no «hay cambios». */
export function contarPendientes(local, subida) {
  const L = { ...capaVacia(), ...(local || {}) };
  const S = { ...capaVacia(), ...(subida || {}) };
  const idsSubidos = new Set((S.bloques || []).map((b) => b.id));
  const ocultosSubidos = new Set(S.ocultos || []);
  const ocultosLocales = new Set(L.ocultos || []);

  const anadidos = (L.bloques || []).filter((b) => !idsSubidos.has(b.id)).length;
  const borrados = (S.bloques || []).filter((b) => !(L.bloques || []).some((x) => x.id === b.id)).length;
  const quitados = [...ocultosLocales].filter((c) => !ocultosSubidos.has(c)).length;
  const restaurados = [...ocultosSubidos].filter((c) => !ocultosLocales.has(c)).length;

  return anadidos + borrados + quitados + restaurados;
}

/** ¿Cambia algo entre estas dos capas? Decide si hay que subir o no. */
export function difieren(a, b) {
  const norm = (c) => {
    const x = { ...capaVacia(), ...(c || {}) };
    return JSON.stringify({
      lugares: [...(x.lugares || [])].map((l) => l.id).sort(),
      bloques: [...(x.bloques || [])].map((v) => v.id).sort(),
      ocultos: [...(x.ocultos || [])].sort(),
    });
  };
  return norm(a) !== norm(b);
}

// --- Con red ---------------------------------------------------------------

/** ¿Hay nube utilizable ahora mismo? Configurada Y con sesión. */
export const activa = async () => Boolean(await nube.configurada()) && nube.haySesion();

function conLimite(promesa, ms = LIMITE_MS) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => setTimeout(() => rechazar(new Error(`la nube no contestó en ${ms} ms`)), ms)),
  ]);
}

/**
 * Baja el viaje. **Nunca lanza**: el que llama tiene que poder seguir con el
 * JSON del repositorio pase lo que pase.
 *
 * Devuelve siempre un objeto con `estado`, y no `null` a secas, porque los tres
 * motivos por los que puede no traer nada piden respuestas distintas y hay que
 * poder decirlos en pantalla:
 *
 *  · `sin-nube`  — no configurada o sin sesión. Es normal y no se avisa.
 *  · `sin-fila`  — hay nube, pero este viaje no está publicado todavía.
 *  · `fallo`     — hay nube y debería haber contestado. **Esto sí se avisa**,
 *                  porque significa que estás viendo una copia que puede estar
 *                  vieja sin saberlo.
 *  · `ok`        — con `bruto`, `capa` y `version`.
 */
export async function bajarViaje(id) {
  if (!(await activa())) return { estado: 'sin-nube' };
  try {
    const doc = await conLimite(nube.leerViaje(id));
    if (!doc) return { estado: 'sin-fila' };
    return { estado: 'ok', ...separar(doc) };
  } catch (e) {
    console.warn('No se ha podido leer el viaje de la nube:', e.message);
    return { estado: 'fallo', motivo: e.message };
  }
}

/** Baja el estado personal. Mismo contrato: null en vez de excepción. */
export async function bajarEstado(id) {
  if (!(await activa())) return null;
  try {
    return await conLimite(nube.leerEstado(id));
  } catch (e) {
    console.warn('No se ha podido leer el estado de la nube:', e.message);
    return null;
  }
}

/**
 * Sube el documento con la capa dentro.
 *
 * Esta sí propaga el error, y a propósito: si el itinerario compartido no ha
 * subido, hay que decirlo. Un conflicto de versión llega con `e.conflicto`.
 */
export async function subirViaje(id, bruto, capa, versionEsperada) {
  const doc = juntar({ ...bruto, id }, capa);
  return nube.guardarViaje(doc, versionEsperada);
}
