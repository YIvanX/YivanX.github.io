/* =========================================================================
   Bitácora · service worker

   Tres políticas, una por tipo de petición:

   · Navegación  → red primero, y si no hay red, el index.html cacheado. Así
                   una versión nueva llega sola al recargar con cobertura, y
                   sin cobertura la aplicación abre igual.
   · Propio      → cache primero y revalidación en segundo plano. Arranca
                   instantáneo y se actualiza para la próxima vez.
   · Teselas     → cache primero con tope y expulsión de las más viejas. Son
                   inmutables: una tesela de León no cambia de un día para otro.

   Subir VERSION invalida todo lo propio. Las teselas sobreviven a propósito:
   volver a descargar el mapa de un viaje ya preparado sería justo lo contrario
   de lo que se busca.
   ========================================================================= */

const VERSION = 'v2';
const CACHE_APP = `bitacora-app-${VERSION}`;
const CACHE_TESELAS = 'bitacora-teselas';
const MAX_TESELAS = 3000;

const ESENCIALES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/base.css',
  'css/componentes.css',
  'css/mapa.css',
  'js/app.js',
  'js/datos.js',
  'js/enlaces-mapa.js',
  'js/estado.js',
  'js/horarios.js',
  'js/mapa.js',
  'js/ui/dom.js',
  'js/ui/hoja.js',
  'js/ui/tema.js',
  'js/ui/brindis.js',
  'js/ui/buscador.js',
  'js/vistas/registro.js',
  'js/vistas/viaje.js',
  'js/vistas/panel.js',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/images/marker-icon.png',
  'vendor/leaflet/images/marker-shadow.png',
  'iconos/icono.svg',
  'data/viajes.json',
];

const esTesela = (url) => url.hostname.endsWith('basemaps.cartocdn.com');
const esPropio = (url) => url.origin === self.location.origin;

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE_APP);
    // De uno en uno: si un archivo falta, addAll aborta el lote entero y la
    // instalación se cae sin decir cuál era.
    await Promise.all(ESENCIALES.map(async (ruta) => {
      try { await cache.add(new Request(ruta, { cache: 'reload' })); }
      catch (e) { console.warn('[sw] no precacheado:', ruta, e.message); }
    }));
    // Los viajes se descubren del registro, así no hay que tocar esta lista
    // cada vez que se añade uno.
    try {
      const registro = await (await fetch('data/viajes.json', { cache: 'reload' })).json();
      await Promise.all((registro.viajes || []).map((v) =>
        cache.add(new Request(v.archivo || `data/viajes/${v.id}.json`, { cache: 'reload' })).catch(() => {})));
    } catch { /* sin registro se sigue: el resto de la aplicación funciona */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    for (const nombre of await caches.keys()) {
      if (nombre.startsWith('bitacora-app-') && nombre !== CACHE_APP) await caches.delete(nombre);
    }
    await self.clients.claim();
  })());
});

async function recortarTeselas() {
  const cache = await caches.open(CACHE_TESELAS);
  const claves = await cache.keys();
  if (claves.length <= MAX_TESELAS) return;
  // keys() devuelve en orden de inserción: las primeras son las más antiguas.
  for (const clave of claves.slice(0, claves.length - MAX_TESELAS)) await cache.delete(clave);
}

let puestas = 0;

async function desdeTeselas(peticion) {
  const cache = await caches.open(CACHE_TESELAS);
  const guardada = await cache.match(peticion);
  if (guardada) return guardada;
  try {
    const respuesta = await fetch(peticion);
    // Las teselas vienen de otro origen: la respuesta es opaca y no se puede
    // leer el estado. Se guarda igual, que es lo que las hace servibles offline.
    if (respuesta && (respuesta.ok || respuesta.type === 'opaque')) {
      await cache.put(peticion, respuesta.clone());
      puestas += 1;
      if (puestas % 40 === 0) recortarTeselas();
    }
    return respuesta;
  } catch {
    return new Response('', { status: 504, statusText: 'Tesela no disponible sin conexión' });
  }
}

async function desdeApp(peticion) {
  const cache = await caches.open(CACHE_APP);
  const guardada = await cache.match(peticion, { ignoreSearch: false });

  const enRed = fetch(peticion).then((respuesta) => {
    if (respuesta && respuesta.ok) cache.put(peticion, respuesta.clone());
    return respuesta;
  }).catch(() => null);

  // Con copia guardada se responde ya y `enRed` sigue por detrás actualizándola.
  if (guardada) return guardada;
  const respuesta = await enRed;
  if (respuesta) return respuesta;
  return new Response('Sin conexión y sin copia guardada', { status: 504 });
}

async function navegacion(peticion) {
  try {
    const respuesta = await fetch(peticion);
    const cache = await caches.open(CACHE_APP);
    cache.put('index.html', respuesta.clone());
    return respuesta;
  } catch {
    const cache = await caches.open(CACHE_APP);
    return (await cache.match('index.html')) || (await cache.match('./'))
      || new Response('Sin conexión', { status: 504, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (request.mode === 'navigate') { evento.respondWith(navegacion(request)); return; }
  if (esTesela(url)) { evento.respondWith(desdeTeselas(request)); return; }
  if (esPropio(url)) { evento.respondWith(desdeApp(request)); return; }
  // Cualquier otro origen se deja pasar sin tocar.
});
