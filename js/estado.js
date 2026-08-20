/**
 * Estado personal: lo visitado, las notas, las tareas marcadas, las fotos y los
 * datos privados.
 *
 * Nada de esto sale del navegador. El repositorio es público, así que la
 * dirección del alojamiento o una referencia de reserva no pueden vivir en un
 * archivo JSON versionado: viven aquí y solo aquí.
 *
 * localStorage para lo pequeño; IndexedDB para las fotos, porque localStorage
 * ronda los 5 MB y una sola foto de móvil ya se los come.
 */

import { validarCapa } from './personalizacion.js';
import { fusionarEstado } from './sincronizacion.js';

const PREFIJO = 'bitacora:v1';
const BD_NOMBRE = 'bitacora';
const BD_VERSION = 1;
const ALMACEN = 'fotos';

const oyentes = new Set();
export const alCambiar = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };
const avisar = (motivo) => oyentes.forEach((fn) => fn(motivo));

// --- localStorage ---------------------------------------------------------

function leer(clave, porDefecto) {
  try {
    const bruto = localStorage.getItem(`${PREFIJO}:${clave}`);
    return bruto ? JSON.parse(bruto) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribir(clave, valor) {
  try {
    localStorage.setItem(`${PREFIJO}:${clave}`, JSON.stringify(valor));
    return true;
  } catch (e) {
    console.warn('No se ha podido guardar en localStorage:', e);
    return false;
  }
}

const vacio = () => ({ visitados: {}, notas: {}, tareas: {}, vistos: {} });

export function estadoDe(viajeId) {
  return { ...vacio(), ...leer(`viaje:${viajeId}`, {}) };
}

function guardarEstado(viajeId, estado) {
  escribir(`viaje:${viajeId}`, estado);
  avisar(viajeId);
}

/**
 * Mete en este dispositivo el estado personal que había en la nube.
 *
 * Fusión y nunca reemplazo, con lo local ganando los choques: entrar en el móvil
 * no puede borrar las notas que escribiste en el móvil. Devuelve lo fundido, o
 * `null` si no había nada que bajar.
 */
export function fusionarRemoto(viajeId, remoto) {
  if (!remoto) return null;
  const fundido = fusionarEstado(estadoDe(viajeId), remoto);
  guardarEstado(viajeId, fundido);
  return fundido;
}

export function esVisitado(viajeId, lugarId) {
  return Boolean(estadoDe(viajeId).visitados[lugarId]);
}

export function alternarVisitado(viajeId, lugarId) {
  const estado = estadoDe(viajeId);
  if (estado.visitados[lugarId]) delete estado.visitados[lugarId];
  else estado.visitados[lugarId] = new Date().toISOString();
  guardarEstado(viajeId, estado);
  return Boolean(estado.visitados[lugarId]);
}

export const notaDe = (viajeId, lugarId) => estadoDe(viajeId).notas[lugarId] || '';

export function guardarNota(viajeId, lugarId, texto) {
  const estado = estadoDe(viajeId);
  if (texto && texto.trim()) estado.notas[lugarId] = texto.trim();
  else delete estado.notas[lugarId];
  guardarEstado(viajeId, estado);
}

export const tareaHecha = (viajeId, itemId) => Boolean(estadoDe(viajeId).tareas[itemId]);

/**
 * Lo tachado de «Qué mirar», que se va marcando estando delante del sitio.
 *
 * La clave es `<lugar>|<texto>` y no un índice: así reordenar la lista no borra
 * lo ya visto. Cambiar el texto sí cuenta como cosa distinta, que es correcto.
 */
export const claveVisto = (lugarId, que) => `${lugarId}|${que}`;

export function alternarVisto(viajeId, clave) {
  const estado = estadoDe(viajeId);
  if (estado.vistos[clave]) delete estado.vistos[clave];
  else estado.vistos[clave] = new Date().toISOString();
  guardarEstado(viajeId, estado);
  return Boolean(estado.vistos[clave]);
}

export function alternarTarea(viajeId, itemId) {
  const estado = estadoDe(viajeId);
  if (estado.tareas[itemId]) delete estado.tareas[itemId];
  else estado.tareas[itemId] = new Date().toISOString();
  guardarEstado(viajeId, estado);
  return Boolean(estado.tareas[itemId]);
}

// --- Capa personal del itinerario -----------------------------------------
// Paradas añadidas y paradas ocultadas. Va aparte del resto del estado porque
// tiene su propio formato, su propia validación y su propia versión.

export const capaDe = (viajeId) => leer(`capa:${viajeId}`, { version: 1, lugares: [], bloques: [], ocultos: [] });

export function guardarCapa(viajeId, capa) {
  escribir(`capa:${viajeId}`, capa);
  avisar(viajeId);
}

// --- Datos privados -------------------------------------------------------
// Dirección del alojamiento, referencias de reserva, teléfonos. Solo aquí.

export const privadosDe = (viajeId) => leer(`privado:${viajeId}`, { campos: [] });

export function guardarPrivados(viajeId, datos) {
  escribir(`privado:${viajeId}`, datos);
  avisar(viajeId);
}

// --- Tema -----------------------------------------------------------------

export const temaGuardado = () => leer('tema', 'auto');
export const guardarTema = (t) => escribir('tema', t);

// --- Fotos (IndexedDB) ----------------------------------------------------

let promesaBd = null;

function abrirBd() {
  if (promesaBd) return promesaBd;
  promesaBd = new Promise((resolver, rechazar) => {
    if (!('indexedDB' in globalThis)) { rechazar(new Error('Este navegador no tiene IndexedDB')); return; }
    const pet = indexedDB.open(BD_NOMBRE, BD_VERSION);
    pet.onupgradeneeded = () => {
      const bd = pet.result;
      if (!bd.objectStoreNames.contains(ALMACEN)) {
        const almacen = bd.createObjectStore(ALMACEN, { keyPath: 'id' });
        almacen.createIndex('porLugar', ['viaje', 'lugar'], { unique: false });
        almacen.createIndex('porViaje', 'viaje', { unique: false });
      }
    };
    pet.onsuccess = () => resolver(pet.result);
    pet.onerror = () => rechazar(pet.error);
  });
  return promesaBd;
}

function transaccion(modo, fn) {
  return abrirBd().then((bd) => new Promise((resolver, rechazar) => {
    const tx = bd.transaction(ALMACEN, modo);
    const pet = fn(tx.objectStore(ALMACEN));
    tx.oncomplete = () => resolver(pet?.result);
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error);
  }));
}

/**
 * Reduce la foto antes de guardarla. Una foto de móvil son 4-8 MB y aquí se
 * quiere un recuerdo navegable, no un archivo maestro: a 1600 px de lado largo
 * y JPEG 0,82 quedan unos 300-500 KB y se ven igual de bien en pantalla.
 */
async function comprimir(archivo, ladoMaximo = 1600, calidad = 0.82) {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext('2d').drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close?.();

  return new Promise((resolver) => lienzo.toBlob(resolver, 'image/jpeg', calidad));
}

export async function anadirFoto(viajeId, lugarId, archivo) {
  const blob = await comprimir(archivo);
  const registro = {
    id: `${viajeId}:${lugarId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    viaje: viajeId,
    lugar: lugarId,
    blob,
    creado: new Date().toISOString(),
  };
  await transaccion('readwrite', (a) => a.put(registro));
  avisar(viajeId);
  return registro;
}

export function fotosDe(viajeId, lugarId) {
  return transaccion('readonly', (a) => a.index('porLugar').getAll([viajeId, lugarId]))
    .then((r) => (r || []).sort((x, y) => x.creado.localeCompare(y.creado)))
    .catch(() => []);
}

export function fotosDelViaje(viajeId) {
  return transaccion('readonly', (a) => a.index('porViaje').getAll(viajeId)).catch(() => []);
}

export async function borrarFoto(viajeId, id) {
  await transaccion('readwrite', (a) => a.delete(id));
  avisar(viajeId);
}

export async function contarFotos(viajeId) {
  return (await fotosDelViaje(viajeId)).length;
}

// --- Exportar e importar --------------------------------------------------
// localStorage se borra al limpiar el navegador y IndexedDB también. Un recuerdo
// de viaje no puede depender de eso, así que hay una salida a archivo.

const aBase64 = (blob) => new Promise((resolver) => {
  const lector = new FileReader();
  lector.onload = () => resolver(lector.result);
  lector.readAsDataURL(blob);
});

const deBase64 = (uri) => fetch(uri).then((r) => r.blob());

export async function exportar(viajeId) {
  const fotos = await fotosDelViaje(viajeId);
  return {
    formato: 'bitacora-recuerdos',
    version: 1,
    viaje: viajeId,
    exportado: new Date().toISOString(),
    estado: estadoDe(viajeId),
    capa: capaDe(viajeId),
    privados: privadosDe(viajeId),
    fotos: await Promise.all(fotos.map(async (f) => ({
      id: f.id, lugar: f.lugar, creado: f.creado, datos: await aBase64(f.blob),
    }))),
  };
}

export async function importar(paquete) {
  if (paquete?.formato !== 'bitacora-recuerdos') {
    throw new Error('Este archivo no es una exportación de Bitácora');
  }
  const viajeId = paquete.viaje;
  if (!viajeId) throw new Error('La exportación no dice a qué viaje pertenece');

  // Fusión, no reemplazo: importar en un dispositivo que ya tiene notas no
  // puede borrar las que había.
  const actual = estadoDe(viajeId);
  guardarEstado(viajeId, {
    visitados: { ...actual.visitados, ...(paquete.estado?.visitados || {}) },
    notas: { ...actual.notas, ...(paquete.estado?.notas || {}) },
    tareas: { ...actual.tareas, ...(paquete.estado?.tareas || {}) },
  });
  if (paquete.privados?.campos?.length) guardarPrivados(viajeId, paquete.privados);

  // La capa se reemplaza entera y no se fusiona: mezclar dos itinerarios
  // editados a mano daría un tercero que no quiso nadie.
  let paradas = 0;
  if (paquete.capa) {
    const fallos = validarCapa(paquete.capa);
    if (fallos.length) throw new Error(`La capa del itinerario tiene errores: ${fallos[0]}`);
    guardarCapa(viajeId, paquete.capa);
    paradas = (paquete.capa.bloques || []).length;
  }

  let fotos = 0;
  const existentes = new Set((await fotosDelViaje(viajeId)).map((f) => f.id));
  for (const foto of paquete.fotos || []) {
    if (existentes.has(foto.id)) continue;
    try {
      // El await va fuera del callback: la flecha que recibe transaccion() no es
      // asíncrona, y meterlo dentro es un error de sintaxis.
      const blob = await deBase64(foto.datos);
      await transaccion('readwrite', (a) => a.put({
        id: foto.id, viaje: viajeId, lugar: foto.lugar, blob, creado: foto.creado,
      }));
      fotos += 1;
    } catch (e) {
      console.warn('Foto no importada:', foto.id, e);
    }
  }
  avisar(viajeId);
  return { fotos, notas: Object.keys(paquete.estado?.notas || {}).length, paradas };
}

/** Cuánto ocupa lo guardado, para poder decirlo en vez de suponerlo. */
export async function ocupacion() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usado: usage || 0, total: quota || 0 };
}
