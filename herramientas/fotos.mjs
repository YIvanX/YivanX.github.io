#!/usr/bin/env node
/**
 * Busca, descarga y da de alta una foto por lugar, desde Wikimedia Commons.
 *
 * Automatiza lo que en León se hizo a mano, incluidos los dos tropiezos:
 *
 *   · **Commons solo sirve tamaños ya generados.** Pedir 640 px devuelve
 *     HTTP 400, no una imagen redimensionada. `pithumbsize=480` resuelve a un
 *     500 px que sí existe y pesa 50-90 KB.
 *   · **Limita el ritmo con 429.** Hay que ir despacio y reintentar con espera
 *     creciente, y guardar después de cada acierto para que una tanda cortada
 *     no obligue a repetir lo ya resuelto.
 *
 * La foto se **descarga al repositorio**, nunca se enlaza: es lo único que la
 * hace funcionar sin conexión. Y `credito` es obligatorio — una foto ajena sin
 * atribución no se puede publicar, y el validador lo comprueba.
 *
 * Uso:
 *   node herramientas/fotos.mjs <viaje>                    # los que no tienen foto
 *   node herramientas/fotos.mjs <viaje> --solo catedral-leon
 *   node herramientas/fotos.mjs <viaje> --titulo museo="Museo Romano de Astorga"
 *   node herramientas/fotos.mjs <viaje> --rehacer          # también los que ya tienen
 *   node herramientas/fotos.mjs <viaje> --sin-escribir     # descarga y enseña, no toca el JSON
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://es.wikipedia.org/w/api.php';
const UA = { 'User-Agent': 'bitacora-viajes/1.0 (uso personal; github.com/YIvanX)' };
const PAUSA = 2000;
const LIMITE_AVISO = 150 * 1024;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Los artículos de municipios llevan como imagen principal la bandera o el
 * escudo, no una foto del sitio. Lo descubrí ejecutando esto: a la estación de
 * Matallana le puso la bandera del ayuntamiento.
 */
const ES_SIMBOLO = /flag|bandera|escudo|coat[_ ]of[_ ]arms|seal|blason|logo/i;
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  ok: (s) => (color ? `\x1b[32m${s}\x1b[0m` : s),
  aviso: (s) => (color ? `\x1b[33m${s}\x1b[0m` : s),
  mal: (s) => (color ? `\x1b[31m${s}\x1b[0m` : s),
  gris: (s) => (color ? `\x1b[90m${s}\x1b[0m` : s),
  fuerte: (s) => (color ? `\x1b[1m${s}\x1b[0m` : s),
};

// --- Argumentos -----------------------------------------------------------
const argv = process.argv.slice(2);
const viajeId = argv.find((a) => !a.startsWith('--'));
const titulos = new Map();
const archivos = new Map();
let solo = null;
let rehacer = false;
let escribir = true;
let incluirAlojamiento = false;
let permitirSimbolos = false;

for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--solo') solo = argv[++i];
  else if (argv[i] === '--rehacer') rehacer = true;
  else if (argv[i] === '--sin-escribir') escribir = false;
  else if (argv[i] === '--incluir-alojamiento') incluirAlojamiento = true;
  else if (argv[i] === '--permitir-simbolos') permitirSimbolos = true;
  else if (argv[i] === '--titulo') {
    const [id, ...resto] = argv[++i].split('=');
    titulos.set(id, resto.join('='));
  } else if (argv[i] === '--archivo') {
    const [id, ...resto] = argv[++i].split('=');
    archivos.set(id, resto.join('=').replace(/^File:/, ''));
  }
}

if (!viajeId) {
  console.error(`
  ${c.fuerte('fotos.mjs')} — una foto por lugar, desde Wikimedia Commons

  node herramientas/fotos.mjs <viaje>
  node herramientas/fotos.mjs <viaje> --solo catedral-leon
  node herramientas/fotos.mjs <viaje> --titulo plaza="Astorga"
  node herramientas/fotos.mjs <viaje> --archivo plaza="Plaza mayor de Astorga.jpg"
  node herramientas/fotos.mjs <viaje> --rehacer | --sin-escribir

  --incluir-alojamiento   por defecto se salta: es dato privado y el repo es público
  --permitir-simbolos     acepta banderas y escudos, que normalmente no quieres
`);
  process.exit(1);
}

const rutaViaje = join(RAIZ, 'data', 'viajes', `${viajeId}.json`);
if (!existsSync(rutaViaje)) { console.error(c.mal(`\n  No existe ${rutaViaje}\n`)); process.exit(1); }

const viaje = JSON.parse(readFileSync(rutaViaje, 'utf8'));
const dirFotos = join(RAIZ, 'data', 'viajes', viajeId, 'fotos');
mkdirSync(dirFotos, { recursive: true });

// --- Wikipedia y Commons --------------------------------------------------
async function json(url, intento = 0) {
  const res = await fetch(url, { headers: UA });
  const texto = await res.text();
  try { return JSON.parse(texto); } catch {
    if (intento < 4) { await dormir(3500 * (intento + 1)); return json(url, intento + 1); }
    throw new Error(`HTTP ${res.status} tras ${intento + 1} intentos (límite de ritmo)`);
  }
}

const limpiar = (v) => (v ? String(v.value).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : null);

/**
 * Miniatura de un archivo concreto de Commons.
 *
 * Es la salida de emergencia para cuando la imagen principal del artículo no
 * sirve: a la Plaza Mayor de Astorga le tocaba la bandera del municipio, y al
 * cambiar de artículo le tocó la misma foto que al museo de al lado. A veces hay
 * que elegir el archivo a mano y no hay más.
 */
async function miniaturaDeArchivo(nombreArchivo) {
  const d = await json(`https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2`
    + `&prop=imageinfo&iiprop=url&iiurlwidth=500&titles=${encodeURIComponent('File:' + nombreArchivo)}`);
  const p = d.query?.pages?.[0];
  const info = p?.imageinfo?.[0];
  if (!info?.thumburl) return null;
  return { articulo: `File:${nombreArchivo}`, url: info.thumburl.split('?')[0], archivo: nombreArchivo };
}

/** Miniatura de 480 → Commons devuelve el 500 px, que es el que tiene generado. */
async function miniatura(titulo) {
  const d = await json(`${API}?action=query&format=json&formatversion=2&redirects=1`
    + `&prop=pageimages&piprop=thumbnail|name&pithumbsize=480&titles=${encodeURIComponent(titulo)}`);
  const p = d.query?.pages?.[0];
  if (!p || p.missing || !p.thumbnail) return null;
  return { articulo: p.title, url: p.thumbnail.source.split('?')[0], archivo: p.pageimage };
}

async function buscarArticulo(consulta) {
  const d = await json(`${API}?action=query&format=json&formatversion=2&list=search&srlimit=1`
    + `&srsearch=${encodeURIComponent(consulta)}`);
  return d.query?.search?.[0]?.title || null;
}

async function credito(nombreArchivo) {
  const d = await json(`${API}?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=extmetadata`
    + `&titles=${encodeURIComponent('File:' + nombreArchivo)}`);
  const m = d.query?.pages?.[0]?.imageinfo?.[0]?.extmetadata || {};
  return { autor: limpiar(m.Artist), licencia: limpiar(m.LicenseShortName) };
}

async function descargar(url) {
  for (let i = 0; i < 3; i += 1) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 404) return null;
    await dormir(3500 * (i + 1));
  }
  return null;
}

// --- Escritura en el JSON, mínima y sin reformatear -----------------------
/**
 * Inserta el bloque `imagen` dentro del lugar, por líneas.
 *
 * A propósito no se hace `JSON.parse` + `stringify`: eso reformatearía el
 * archivo entero y convertiría un cambio de cuatro líneas en un diff de mil.
 * Si no encuentra un sitio seguro donde insertar, no toca nada y lo dice.
 */
function insertarImagen(lineas, lugarId, imagen) {
  const iId = lineas.findIndex((l) => l.trim() === `"id": "${lugarId}",`);
  if (iId === -1) return { ok: false, motivo: `no se encuentra la línea del id "${lugarId}"` };

  const sangria = ' '.repeat(lineas[iId].length - lineas[iId].trimStart().length);
  const cierre = sangria.slice(2);

  let destino = -1;
  for (let i = iId + 1; i < lineas.length; i += 1) {
    if (lineas[i].startsWith(`${sangria}"imagen"`)) return { ok: false, motivo: 'ya tiene imagen' };
    if (lineas[i].startsWith(`${sangria}"verificado"`)) { destino = i; break; }
    if (lineas[i] === `${cierre}},` || lineas[i] === `${cierre}}`) { destino = i; break; }
  }
  if (destino === -1) return { ok: false, motivo: 'no se encuentra el final del lugar' };

  const p = (k, v) => `${sangria}  ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  const campos = [p('archivo', imagen.archivo), p('credito', imagen.credito)];
  if (imagen.licencia) campos.push(p('licencia', imagen.licencia));
  if (imagen.fuente) campos.push(p('fuente', imagen.fuente));

  lineas.splice(destino, 0, `${sangria}"imagen": {`, ...campos.map((x, i) => (i < campos.length - 1 ? `${x},` : x)), `${sangria}},`);
  return { ok: true };
}

// --- Ejecución ------------------------------------------------------------
const objetivo = viaje.lugares.filter((l) => {
  if (solo) return l.id === solo;
  // El alojamiento se salta por defecto: es dato privado y el repositorio es
  // público. Una foto de la casa de alguien no pinta nada aquí.
  if (l.categoria === 'alojamiento' && !incluirAlojamiento) return false;
  return rehacer || !l.imagen;
});

if (!objetivo.length) {
  console.log(c.ok(`\n  Todos los lugares de "${viajeId}" ya tienen foto. Usa --rehacer para repetirlos.\n`));
  process.exit(0);
}

console.log(`\n  ${c.fuerte(viajeId)} ${c.gris(`· ${objetivo.length} lugar(es) sin foto`)}\n`);

let lineas = readFileSync(rutaViaje, 'utf8').split('\n');
let hechas = 0;
const pendientes = [];

for (const lugar of objetivo) {
  const consulta = titulos.get(lugar.id) || lugar.nombre;
  try {
    let img = archivos.has(lugar.id) ? await miniaturaDeArchivo(archivos.get(lugar.id)) : await miniatura(consulta);
    await dormir(PAUSA);

    if (!img) {
      const alternativo = await buscarArticulo(consulta);
      await dormir(PAUSA);
      if (alternativo) { img = await miniatura(alternativo); await dormir(PAUSA); }
    }
    if (!img) {
      console.log(`${c.aviso('SIN FOTO')}  ${lugar.id.padEnd(24)} ${c.gris(`nada para "${consulta}"`)}`);
      console.log(c.gris(`          prueba: --titulo ${lugar.id}="<artículo de Wikipedia>"\n`));
      continue;
    }

    if (ES_SIMBOLO.test(img.archivo) && !permitirSimbolos) {
      console.log(`${c.aviso('SÍMBOLO')}  ${lugar.id.padEnd(24)} ${c.gris(img.archivo.slice(0, 40))}`);
      console.log(c.gris('          es una bandera o un escudo, no una foto del sitio. Descartada.'));
      console.log(c.gris(`          arréglalo con --titulo ${lugar.id}="<artículo con foto>", o fuérzalo con --permitir-simbolos
`));
      continue;
    }

    const cred = await credito(img.archivo);
    await dormir(PAUSA);

    const buf = await descargar(img.url);
    if (!buf) { console.log(`${c.mal('ERROR')}  ${lugar.id}  no se ha podido descargar`); continue; }

    const ext = (img.url.match(/\.(jpe?g|png|webp)$/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    const nombre = `${lugar.id}.${ext}`;
    writeFileSync(join(dirFotos, nombre), buf);

    const imagen = {
      archivo: `data/viajes/${viajeId}/fotos/${nombre}`,
      credito: (cred.autor || 'Wikimedia Commons').slice(0, 70),
      licencia: cred.licencia,
      fuente: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(img.archivo)}`,
    };

    const kb = (buf.length / 1024).toFixed(0);
    const gordo = buf.length > LIMITE_AVISO ? c.aviso(` ${kb} KB`) : `${kb} KB`;
    console.log(`${c.ok('OK')}  ${lugar.id.padEnd(24)} ${gordo.padStart(9)}  ${(cred.licencia || '?').padEnd(14)} ${img.articulo.slice(0, 34)}`);
    if (buf.length > LIMITE_AVISO) {
      console.log(c.gris(`      pesa bastante: Commons no tenía un tamaño menor generado para esta`));
    }

    if (escribir) {
      const r = insertarImagen(lineas, lugar.id, imagen);
      if (!r.ok) { pendientes.push({ lugar: lugar.id, imagen, motivo: r.motivo }); }
      else { writeFileSync(rutaViaje, lineas.join('\n')); hechas += 1; }
    } else {
      pendientes.push({ lugar: lugar.id, imagen, motivo: '--sin-escribir' });
    }
  } catch (e) {
    console.log(`${c.mal('ERROR')}  ${lugar.id.padEnd(24)} ${e.message}`);
  }
}

if (pendientes.length) {
  console.log(c.aviso(`\n  ${pendientes.length} sin escribir en el JSON — pégalos a mano:\n`));
  for (const p of pendientes) {
    console.log(c.gris(`  // ${p.lugar} (${p.motivo})`));
    console.log(`  ${JSON.stringify({ imagen: p.imagen }, null, 2).split('\n').join('\n  ')}\n`);
  }
}

const total = viaje.lugares.filter((l) => l.imagen).length + hechas;
let peso = 0;
for (const l of viaje.lugares) {
  if (l.imagen && existsSync(join(RAIZ, l.imagen.archivo))) peso += statSync(join(RAIZ, l.imagen.archivo)).size;
}
console.log(`\n  ${c.ok(`${hechas} foto(s) añadidas`)} ${c.gris(`· ${total} de ${viaje.lugares.length} lugares con foto · ${(peso / 1048576).toFixed(2)} MB`)}`);
console.log(c.gris(`  Ahora: node herramientas/validar.mjs ${viajeId}\n`));
