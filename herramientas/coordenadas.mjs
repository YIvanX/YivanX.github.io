#!/usr/bin/env node
/**
 * Busca coordenadas verificadas para los lugares de un viaje.
 *
 * Existe porque montar León a mano dejó claro que **buscar por nombre suelto no
 * vale**: pedir «Catedral de León» devolvió la catedral de Burgos y «Estación de
 * Ponferrada» devolvió una estación de esquí. Seis de veintiséis salieron mal.
 *
 * Lo que arregla eso son dos cosas, y las dos las hace esta herramienta:
 *
 *   1. **Acotar por área.** Se resuelve el recuadro del municipio o la provincia
 *      y se busca dentro, con `bounded=1`. Ahí se cae la catedral de Burgos.
 *   2. **Enseñar los candidatos con su etiqueta de OSM**, no solo el primero.
 *      Un `leisure/sports_centre` cuando esperabas una estación canta solo.
 *
 * Uso:
 *   node herramientas/coordenadas.mjs --area "León, España" "Catedral de León" "Casa Botines"
 *   node herramientas/coordenadas.mjs --area "El Bierzo" --tipo estacion "Ponferrada"
 *   node herramientas/coordenadas.mjs --area "León" --json "Catedral de León"
 *
 * Opciones:
 *   --area "<sitio>"   Acota la búsqueda al recuadro de ese sitio. Muy recomendable.
 *   --tipo estacion    Pregunta a Overpass por `railway=station`, mucho más fiable
 *                      que buscar una estación por su nombre.
 *   --json             Saca un objeto pegable en el JSON del viaje.
 *   --n <n>            Cuántos candidatos enseñar por consulta (3 por defecto).
 */

const UA = { 'User-Agent': 'bitacora-viajes/1.0 (uso personal; github.com/YIvanX)' };
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

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
const consultas = [];
let area = null;
let tipo = null;
let comoJson = false;
let cuantos = 3;

for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--area') { area = argv[++i]; }
  else if (a === '--tipo') { tipo = argv[++i]; }
  else if (a === '--json') { comoJson = true; }
  else if (a === '--n') { cuantos = Number(argv[++i]) || 3; }
  else if (a === '--ayuda' || a === '-h') { ayuda(); process.exit(0); }
  else consultas.push(a);
}

function ayuda() {
  console.log(`
  ${c.fuerte('coordenadas.mjs')} — coordenadas verificadas para un viaje

  node herramientas/coordenadas.mjs --area "León, España" "Catedral de León" "Casa Botines"
  node herramientas/coordenadas.mjs --area "El Bierzo" --tipo estacion "Ponferrada"

  --area "<sitio>"   acota al recuadro de ese sitio. Muy recomendable
  --tipo estacion    usa Overpass y railway=station, mucho más fiable por nombre
  --json             saca un objeto pegable en el JSON del viaje
  --n <n>            candidatos por consulta (3 por defecto)
`);
}

if (!consultas.length) { ayuda(); process.exit(1); }

// --- Peticiones -----------------------------------------------------------
/** Nominatim y Overpass limitan el ritmo: despacio y con reintentos. */
async function pedir(url, opciones = {}, intento = 0) {
  const res = await fetch(url, { headers: UA, ...opciones });
  const texto = await res.text();
  try {
    return JSON.parse(texto);
  } catch {
    if (intento < 3) { await dormir(3000 * (intento + 1)); return pedir(url, opciones, intento + 1); }
    throw new Error(`respuesta no-JSON (HTTP ${res.status}) tras ${intento + 1} intentos`);
  }
}

async function recuadroDe(nombre) {
  const d = await pedir(`${NOMINATIM}/search?format=jsonv2&limit=1&q=${encodeURIComponent(nombre)}`);
  if (!d.length || !d[0].boundingbox) return null;
  // Nominatim da [surLat, norteLat, oesteLon, esteLon].
  const [sur, norte, oeste, este] = d[0].boundingbox.map(Number);
  return { sur, norte, oeste, este, nombre: d[0].display_name };
}

async function buscarNominatim(consulta, recuadro) {
  let url = `${NOMINATIM}/search?format=jsonv2&limit=${cuantos}&q=${encodeURIComponent(consulta)}`;
  if (recuadro) {
    url += `&bounded=1&viewbox=${recuadro.oeste},${recuadro.norte},${recuadro.este},${recuadro.sur}`;
  }
  const d = await pedir(url);
  return d.map((x) => ({
    lat: Number(Number(x.lat).toFixed(5)),
    lon: Number(Number(x.lon).toFixed(5)),
    etiqueta: `${x.category}/${x.type}`,
    nombre: x.display_name,
  }));
}

async function buscarEstacion(consulta, recuadro) {
  if (!recuadro) throw new Error('--tipo estacion necesita --area para acotar el recuadro');
  const q = `[out:json][timeout:25];node["railway"="station"](${recuadro.sur},${recuadro.oeste},${recuadro.norte},${recuadro.este});out body;`;
  const d = await pedir(OVERPASS, { method: 'POST', body: `data=${encodeURIComponent(q)}` });
  const plano = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const objetivo = plano(consulta);
  return (d.elements || [])
    .map((e) => ({
      lat: Number(e.lat.toFixed(5)),
      lon: Number(e.lon.toFixed(5)),
      etiqueta: `railway/station${e.tags?.operator ? ` · ${e.tags.operator}` : ''}`,
      nombre: e.tags?.name || '(sin nombre)',
      puntos: plano(e.tags?.name || '').includes(objetivo) ? 2 : 0,
    }))
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, cuantos);
}

// --- Ejecución ------------------------------------------------------------
let recuadro = null;
if (area) {
  recuadro = await recuadroDe(area);
  if (!recuadro) {
    console.error(c.mal(`\n  No se ha podido resolver el área "${area}". Se busca sin acotar.\n`));
  } else {
    console.log(c.gris(`\n  Área: ${recuadro.nombre.slice(0, 70)}`));
    console.log(c.gris(`  Recuadro: ${recuadro.sur}..${recuadro.norte} · ${recuadro.oeste}..${recuadro.este}\n`));
  }
  await dormir(1200);
} else {
  console.log(c.aviso('\n  Sin --area. Busca en todo el mundo, que es como aparece la catedral de Burgos.\n'));
}

const salida = {};
for (const consulta of consultas) {
  try {
    const cand = tipo === 'estacion'
      ? await buscarEstacion(consulta, recuadro)
      : await buscarNominatim(consulta, recuadro);

    if (!cand.length) {
      console.log(`${c.mal('SIN RESULTADO')}  ${c.fuerte(consulta)}`);
      console.log(c.gris('               prueba otro nombre, o quita --area si el sitio cae fuera\n'));
      continue;
    }

    console.log(c.fuerte(consulta));
    cand.forEach((r, i) => {
      const marca = i === 0 ? c.ok(' →') : c.gris('  ');
      console.log(`${marca} [${r.lat}, ${r.lon}]  ${c.gris(r.etiqueta.padEnd(26))} ${r.nombre.slice(0, 58)}`);
    });
    if (cand.length > 1) console.log(c.gris('   mira la etiqueta antes de fiarte del primero'));
    console.log('');

    salida[consulta] = [cand[0].lat, cand[0].lon];
  } catch (e) {
    console.log(`${c.mal('ERROR')}  ${consulta}  ${e.message}\n`);
  }
  await dormir(1300);
}

if (comoJson && Object.keys(salida).length) {
  console.log(c.gris('  --- para pegar ---'));
  console.log(JSON.stringify(salida, null, 2));
}

console.log(c.gris(`\n  Datos de OpenStreetMap · ODbL. Comprueba siempre la etiqueta y el nombre completo.\n`));
