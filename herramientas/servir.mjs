#!/usr/bin/env node
/**
 * Servidor estático mínimo para probar en local.
 *
 * Hace falta porque el sitio usa módulos ES y un service worker, y ninguna de
 * las dos cosas funciona abriendo el index.html con doble clic: `file://` no
 * tiene origen y el navegador bloquea los dos.
 *
 *   node herramientas/servir.mjs [puerto]
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, extname, sep } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = Number(process.argv[2]) || 8080;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const servidor = createServer(async (peticion, respuesta) => {
  const url = new URL(peticion.url, `http://${peticion.headers.host}`);
  let ruta = decodeURIComponent(url.pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';

  const destino = resolve(join(RAIZ, ruta));
  // Sin esto, /../../ saldría de la carpeta del sitio.
  if (!destino.startsWith(RAIZ + sep) && destino !== RAIZ) {
    respuesta.writeHead(403).end('Prohibido');
    return;
  }

  try {
    const info = await stat(destino);
    if (info.isDirectory()) { respuesta.writeHead(301, { Location: `${ruta}/` }).end(); return; }
    const cuerpo = await readFile(destino);
    respuesta.writeHead(200, {
      'Content-Type': TIPOS[extname(destino).toLowerCase()] || 'application/octet-stream',
      'Content-Length': cuerpo.length,
      // Sin caché: probando en local, una copia guardada solo confunde.
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/',
    }).end(cuerpo);
  } catch {
    respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`No encontrado: ${ruta}`);
  }
});

servidor.listen(PUERTO, () => {
  console.log(`Bitácora en http://localhost:${PUERTO}/`);
  console.log(`Sirviendo ${RAIZ}`);
});
