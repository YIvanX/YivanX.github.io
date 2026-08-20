#!/usr/bin/env node
/**
 * Crea el esqueleto de un viaje nuevo a partir de la plantilla y lo da de alta
 * en el registro, todo de una vez.
 *
 * Hacerlo a mano son tres pasos y el tercero — acordarse de añadirlo a
 * data/viajes.json — es el que se olvida, y entonces el viaje existe pero no
 * aparece en la portada.
 *
 *   node herramientas/nuevo-viaje.mjs <id> "<Título>" <AAAA-MM-DD> <AAAA-MM-DD>
 *   node herramientas/nuevo-viaje.mjs <id> "<Título>" <inicio> <fin> --desde <viaje>
 *
 * Ejemplo:
 *   node herramientas/nuevo-viaje.mjs oporto-2027-05 "Oporto" 2027-05-14 2027-05-20
 *   node herramientas/nuevo-viaje.mjs oporto-2027-05 "Oporto" 2027-05-14 2027-05-20 --desde leon-2026-08
 *
 * `--desde` copia lo que de verdad se repite de un viaje a otro: **las listas**
 * —activar el bono de tren, la chaqueta, la batería externa— y **los conceptos
 * del presupuesto**, sin importes. No copia lugares, días ni transporte: eso es
 * del destino y copiarlo solo daría trabajo de borrado.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const iDesde = argv.indexOf('--desde');
const desde = iDesde !== -1 ? argv[iDesde + 1] : null;
const posicionales = argv.filter((a, i) => a !== '--desde' && (iDesde === -1 || i !== iDesde + 1));
const [id, titulo, inicio, fin] = posicionales;

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function morir(mensaje) {
  console.error(`\n  ${mensaje}\n`);
  console.error('  Uso: node herramientas/nuevo-viaje.mjs <id> "<Título>" <AAAA-MM-DD> <AAAA-MM-DD> [--desde <viaje>]');
  console.error('  Ej.: node herramientas/nuevo-viaje.mjs oporto-2027-05 "Oporto" 2027-05-14 2027-05-20\n');
  process.exit(1);
}

if (!id || !titulo || !inicio || !fin) morir('Faltan argumentos.');
if (!KEBAB.test(id)) morir(`El id "${id}" tiene que ir en kebab-case: solo minúsculas, números y guiones.`);
if (!ISO.test(inicio) || !ISO.test(fin)) morir('Las fechas van en formato AAAA-MM-DD.');
if (fin < inicio) morir(`La fecha de fin (${fin}) es anterior a la de inicio (${inicio}).`);

const destino = join(RAIZ, 'data', 'viajes', `${id}.json`);
if (existsSync(destino)) morir(`Ya existe ${destino}. Elige otro id o bórralo tú a mano.`);

// --- Días entre las dos fechas, ambos incluidos ---------------------------
const dias = [];
for (let d = new Date(`${inicio}T00:00:00`); d <= new Date(`${fin}T00:00:00`); d.setDate(d.getDate() + 1)) {
  const p = (n) => String(n).padStart(2, '0');
  dias.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
}

// --- Herencia de un viaje anterior ---------------------------------------
let listasHeredadas = [{ titulo: 'Antes de salir', items: [] }];
let partidasHeredadas = [];

if (desde) {
  const origen = join(RAIZ, 'data', 'viajes', `${desde}.json`);
  if (!existsSync(origen)) morir(`No existe el viaje de origen: ${origen}`);
  const anterior = JSON.parse(readFileSync(origen, 'utf8'));

  // Las tareas se guardan por viaje, así que los mismos id no chocan entre
  // viajes distintos. Se copian sin marcar: es una lista nueva.
  listasHeredadas = (anterior.listas || []).map((l) => ({
    titulo: l.titulo,
    items: (l.items || []).map((it) => ({ id: it.id, texto: it.texto, ...(it.detalle ? { detalle: it.detalle } : {}) })),
  }));
  // Los conceptos se repiten viaje a viaje; los importes no.
  partidasHeredadas = (anterior.presupuesto?.partidas || []).map((p) => ({
    concepto: p.concepto, importe: '', ...(p.destacado ? { destacado: true } : {}),
  }));
}

// --- Esqueleto ------------------------------------------------------------
const viaje = {
  id,
  version: 1,
  titulo,
  subtitulo: '',
  estado: 'planificado',
  fechas: { inicio, fin },
  viajeros: [],
  moneda: 'EUR',
  base: '',
  resumen: '',
  avisos: [],
  lugares: [
    {
      id: 'alojamiento',
      nombre: 'Alojamiento',
      categoria: 'alojamiento',
      coords: [0, 0],
      resumen: 'Base del viaje.',
      descripcion: 'La dirección exacta y la referencia de reserva NO van aquí: este repositorio es público. Van al panel de «Datos privados» de la aplicación, que vive solo en el navegador.',
      verificado: { fecha: new Date().toISOString().slice(0, 10), fuente: 'pendiente' },
    },
  ],
  dias: dias.map((fecha, i) => ({
    fecha,
    titulo: i === 0 ? 'Llegada' : i === dias.length - 1 ? 'Salida' : `Día ${i + 1}`,
    intensidad: i === 0 ? 'llegada' : i === dias.length - 1 ? 'salida' : 'suave',
    resumen: '',
    bloques: [],
  })),
  transporte: [],
  listas: listasHeredadas,
  presupuesto: { nota: '', partidas: partidasHeredadas },
  fuentes: [],
};

mkdirSync(join(RAIZ, 'data', 'viajes', id, 'fotos'), { recursive: true });
writeFileSync(destino, `${JSON.stringify(viaje, null, 2)}\n`, 'utf8');

// --- Alta en el registro --------------------------------------------------
const rutaRegistro = join(RAIZ, 'data', 'viajes.json');
const registro = JSON.parse(readFileSync(rutaRegistro, 'utf8'));
registro.viajes.push({
  id,
  archivo: `data/viajes/${id}.json`,
  titulo,
  subtitulo: '',
  fechas: { inicio, fin },
  estado: 'planificado',
});
registro.viajes.sort((a, b) => b.fechas.inicio.localeCompare(a.fechas.inicio));
writeFileSync(rutaRegistro, `${JSON.stringify(registro, null, 2)}\n`, 'utf8');

const heredado = desde
  ? `
  Heredado de ${desde}: ${listasHeredadas.reduce((n, l) => n + l.items.length, 0)} tarea(s) y ${partidasHeredadas.length} concepto(s) de presupuesto`
  : '';

console.log(`
  Creado  data/viajes/${id}.json      ${dias.length} días, del ${inicio} al ${fin}${heredado}
  Creado  data/viajes/${id}/fotos/
  Alta en data/viajes.json

  Ahora:
    1. Rellena lugares[] y los bloques de cada día.
       La plantilla comentada campo a campo está en data/viajes/_plantilla.json
    2. Saca las coordenadas de OpenStreetMap. No las pongas de memoria.
    3. node herramientas/coordenadas.mjs --area "<ciudad>" "<lugar>" "<lugar>"
    4. node herramientas/fotos.mjs ${id}
    5. node herramientas/validar.mjs ${id}
    6. node herramientas/servir.mjs   →  http://localhost:8080/#/v/${id}
`);
