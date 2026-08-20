#!/usr/bin/env node
/**
 * Valida los viajes de data/viajes/ contra el contrato de schema/viaje.schema.json.
 *
 * Sin dependencias, a propósito: una herramienta que solo hace falta cada varios
 * meses no puede depender de que un `npm install` siga funcionando dentro de años.
 *
 *   node herramientas/validar.mjs                   → valida todos los viajes
 *   node herramientas/validar.mjs leon-2026-08      → valida uno
 *   node herramientas/validar.mjs data/viajes/x.json
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, resolve } from 'node:path';
import { revisarBloque, aMinutos, claveDia, diasEntre, NOMBRE_DIA } from '../js/horarios.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CATEGORIAS = ['patrimonio', 'naturaleza', 'comida', 'pueblo', 'transporte', 'alojamiento', 'practico'];
const MODOS = ['a-pie', 'tren', 'bus', 'taxi', 'coche', 'barco', 'avion', 'bici'];
const ESTADOS = ['planificado', 'en-curso', 'completado'];
const INTENSIDADES = ['llegada', 'suave', 'media', 'fuerte', 'salida'];
const TIPOS_BLOQUE = ['visita', 'traslado', 'hito'];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  rojo: (s) => (color ? `\x1b[31m${s}\x1b[0m` : s),
  ambar: (s) => (color ? `\x1b[33m${s}\x1b[0m` : s),
  verde: (s) => (color ? `\x1b[32m${s}\x1b[0m` : s),
  gris: (s) => (color ? `\x1b[90m${s}\x1b[0m` : s),
  fuerte: (s) => (color ? `\x1b[1m${s}\x1b[0m` : s),
};

class Informe {
  constructor(etiqueta) {
    this.etiqueta = etiqueta;
    this.errores = [];
    this.avisos = [];
  }
  error(donde, mensaje) { this.errores.push({ donde, mensaje }); }
  aviso(donde, mensaje) { this.avisos.push({ donde, mensaje }); }
  imprimir() {
    const { errores, avisos } = this;
    console.log(`\n${c.fuerte(this.etiqueta)}`);
    for (const e of errores) console.log(`  ${c.rojo('ERROR')}  ${c.gris(e.donde)}  ${e.mensaje}`);
    for (const a of avisos) console.log(`  ${c.ambar('AVISO')}  ${c.gris(a.donde)}  ${a.mensaje}`);
    if (!errores.length && !avisos.length) console.log(`  ${c.verde('correcto')}`);
    else console.log(c.gris(`  ${errores.length} error(es) · ${avisos.length} aviso(s)`));
  }
}

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esTexto = (v) => typeof v === 'string' && v.length > 0;

function validarCoords(inf, donde, coords) {
  if (!Array.isArray(coords) || coords.length !== 2 || coords.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    inf.error(donde, 'coords debe ser [latitud, longitud] con dos números');
    return false;
  }
  const [lat, lon] = coords;
  if (lat < -90 || lat > 90) { inf.error(donde, `latitud fuera de rango: ${lat}`); return false; }
  if (lon < -180 || lon > 180) { inf.error(donde, `longitud fuera de rango: ${lon}`); return false; }
  if (lat === 0 && lon === 0) { inf.error(donde, 'coords en [0,0]: es el marcador de "sin rellenar", no un sitio'); return false; }
  return true;
}

/** Distancia aproximada en km (Haversine). Sirve para detectar coordenadas descolocadas. */
function distanciaKm([lat1, lon1], [lat2, lon2]) {
  const R = 6371;
  const r = (g) => (g * Math.PI) / 180;
  const dLat = r(lat2 - lat1);
  const dLon = r(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function validarViaje(viaje, nombreArchivo) {
  const inf = new Informe(`${nombreArchivo}`);

  // --- Cabecera ---------------------------------------------------------
  for (const campo of ['id', 'titulo', 'estado', 'fechas', 'lugares', 'dias']) {
    if (viaje[campo] === undefined) inf.error('raíz', `falta el campo obligatorio "${campo}"`);
  }
  if (esTexto(viaje.id) && !KEBAB.test(viaje.id)) inf.error('raíz', `id "${viaje.id}" no está en kebab-case`);
  if (esTexto(viaje.id) && basename(nombreArchivo, '.json') !== viaje.id) {
    inf.error('raíz', `el id "${viaje.id}" no coincide con el nombre del archivo "${basename(nombreArchivo)}"`);
  }
  if (viaje.estado && !ESTADOS.includes(viaje.estado)) {
    inf.error('raíz', `estado "${viaje.estado}" no es válido (${ESTADOS.join(' | ')})`);
  }

  const fechas = viaje.fechas || {};
  if (!ISO.test(fechas.inicio || '')) inf.error('fechas', 'inicio debe ser AAAA-MM-DD');
  if (!ISO.test(fechas.fin || '')) inf.error('fechas', 'fin debe ser AAAA-MM-DD');
  if (ISO.test(fechas.inicio || '') && ISO.test(fechas.fin || '') && fechas.fin < fechas.inicio) {
    inf.error('fechas', `fin (${fechas.fin}) es anterior a inicio (${fechas.inicio})`);
  }

  // --- Lugares ----------------------------------------------------------
  const lugares = new Map();
  const coordsValidas = [];
  for (const [i, lugar] of (viaje.lugares || []).entries()) {
    const donde = `lugares[${i}]${lugar?.id ? ` ${lugar.id}` : ''}`;
    if (!esObjeto(lugar)) { inf.error(donde, 'no es un objeto'); continue; }
    if (!esTexto(lugar.id) || !KEBAB.test(lugar.id)) inf.error(donde, 'id ausente o no está en kebab-case');
    else if (lugares.has(lugar.id)) inf.error(donde, `id duplicado: "${lugar.id}"`);
    else lugares.set(lugar.id, lugar);

    if (!esTexto(lugar.nombre)) inf.error(donde, 'falta nombre');
    if (!esTexto(lugar.resumen)) inf.error(donde, 'falta resumen (la línea que se ve en la lista y en el mapa)');
    if (!CATEGORIAS.includes(lugar.categoria)) inf.error(donde, `categoria "${lugar.categoria}" no válida (${CATEGORIAS.join(' | ')})`);
    if (validarCoords(inf, donde, lugar.coords)) coordsValidas.push({ id: lugar.id, coords: lugar.coords });

    if (lugar.horarios !== undefined) {
      if (!esObjeto(lugar.horarios)) inf.error(donde, 'horarios debe ser un objeto por día de la semana');
      else {
        for (const [dia, franjas] of Object.entries(lugar.horarios)) {
          if (!NOMBRE_DIA[dia]) { inf.error(donde, `clave de día no válida: "${dia}" (lun mar mie jue vie sab dom)`); continue; }
          if (!Array.isArray(franjas)) { inf.error(donde, `horarios.${dia} debe ser una lista de franjas`); continue; }
          for (const franja of franjas) {
            if (!Array.isArray(franja) || franja.length !== 2 || franja.some((h) => Number.isNaN(aMinutos(h)))) {
              inf.error(donde, `franja no válida en ${dia}: ${JSON.stringify(franja)} — se espera ["HH:MM","HH:MM"]`);
            }
          }
        }
      }
    }
    if (lugar.precio !== undefined && (!esObjeto(lugar.precio) || typeof lugar.precio.importe !== 'number')) {
      inf.error(donde, 'precio debe ser { importe: número, detalle?: texto }');
    }
    if (!lugar.verificado) inf.aviso(donde, 'sin campo "verificado": un horario sin fuente ni fecha es un rumor');
    for (const [j, enlace] of (lugar.enlaces || []).entries()) {
      if (!esTexto(enlace?.url) || !/^https?:\/\//.test(enlace.url)) inf.error(`${donde}.enlaces[${j}]`, 'url ausente o no absoluta');
    }
    if (lugar.imagen !== undefined) {
      const img = lugar.imagen;
      if (!esObjeto(img) || !esTexto(img.archivo)) inf.error(donde, 'imagen debe ser { archivo, credito, licencia?, fuente? }');
      else {
        if (!existsSync(join(RAIZ, img.archivo))) inf.error(donde, `la imagen no existe: ${img.archivo}`);
        if (!esTexto(img.credito)) inf.error(donde, 'imagen sin credito: una foto de un tercero sin atribución no se puede publicar');
        if (!esTexto(img.licencia)) inf.aviso(donde, 'imagen sin licencia declarada');
      }
    }
    for (const [j, foto] of (lugar.fotos || []).entries()) {
      if (!esTexto(foto?.archivo)) { inf.error(`${donde}.fotos[${j}]`, 'falta archivo'); continue; }
      if (!existsSync(join(RAIZ, foto.archivo))) inf.error(`${donde}.fotos[${j}]`, `el archivo no existe: ${foto.archivo}`);
    }
  }

  // Coordenada descolocada: el error de geocodificación típico, y no se ve leyendo el JSON.
  if (coordsValidas.length >= 3) {
    const centro = [
      coordsValidas.reduce((s, l) => s + l.coords[0], 0) / coordsValidas.length,
      coordsValidas.reduce((s, l) => s + l.coords[1], 0) / coordsValidas.length,
    ];
    for (const l of coordsValidas) {
      const d = distanciaKm(centro, l.coords);
      if (d > 300) inf.error(`lugares ${l.id}`, `a ${Math.round(d)} km del centro del viaje: ¿coordenada equivocada?`);
      else if (d > 150) inf.aviso(`lugares ${l.id}`, `a ${Math.round(d)} km del centro del viaje: comprobar que es correcto`);
    }
  }

  // --- Días y bloques ---------------------------------------------------
  const usados = new Set();
  const fechasVistas = new Set();
  let anterior = null;

  for (const [i, dia] of (viaje.dias || []).entries()) {
    const donde = `dias[${i}] ${dia?.fecha || '?'}`;
    if (!esObjeto(dia)) { inf.error(donde, 'no es un objeto'); continue; }
    if (!ISO.test(dia.fecha || '')) inf.error(donde, 'fecha debe ser AAAA-MM-DD');
    else {
      if (fechasVistas.has(dia.fecha)) inf.error(donde, `fecha duplicada: ${dia.fecha}`);
      fechasVistas.add(dia.fecha);
      if (anterior && dia.fecha <= anterior) inf.error(donde, `los días no están en orden ascendente (después de ${anterior})`);
      anterior = dia.fecha;
      if (ISO.test(fechas.inicio || '') && (dia.fecha < fechas.inicio || dia.fecha > fechas.fin)) {
        inf.error(donde, `la fecha cae fuera del viaje (${fechas.inicio} … ${fechas.fin})`);
      }
    }
    if (!esTexto(dia.titulo)) inf.error(donde, 'falta titulo');
    if (dia.intensidad && !INTENSIDADES.includes(dia.intensidad)) {
      inf.error(donde, `intensidad "${dia.intensidad}" no válida (${INTENSIDADES.join(' | ')})`);
    }

    let finAnterior = null;
    for (const [j, bloque] of (dia.bloques || []).entries()) {
      const dondeB = `${donde} bloque[${j}]`;
      const tipo = bloque.tipo || 'visita';
      if (!TIPOS_BLOQUE.includes(tipo)) { inf.error(dondeB, `tipo "${tipo}" no válido`); continue; }

      const ini = aMinutos(bloque.inicio);
      if (bloque.inicio !== undefined && Number.isNaN(ini)) inf.error(dondeB, `inicio "${bloque.inicio}" no es HH:MM`);
      const fin = bloque.fin !== undefined ? aMinutos(bloque.fin) : NaN;
      if (bloque.fin !== undefined && Number.isNaN(fin)) inf.error(dondeB, `fin "${bloque.fin}" no es HH:MM`);
      if (!Number.isNaN(ini) && !Number.isNaN(fin) && fin < ini) {
        inf.error(dondeB, `fin (${bloque.fin}) es anterior a inicio (${bloque.inicio})`);
      }
      // Los bloques deben ir en orden. Un solape no siempre es un fallo (una parada
      // "de camino" dentro de un traslado es legítima), así que es aviso.
      if (!Number.isNaN(ini) && finAnterior !== null && ini < finAnterior) {
        inf.aviso(dondeB, `empieza a las ${bloque.inicio}, antes de que acabe el bloque anterior (${(finAnterior / 60 | 0).toString().padStart(2, '0')}:${(finAnterior % 60).toString().padStart(2, '0')})`);
      }
      if (!Number.isNaN(fin)) finAnterior = fin;

      if (tipo === 'visita') {
        if (!esTexto(bloque.lugar)) { inf.error(dondeB, 'un bloque de visita necesita "lugar"'); continue; }
        const lugar = lugares.get(bloque.lugar);
        if (!lugar) { inf.error(dondeB, `referencia a un lugar inexistente: "${bloque.lugar}"`); continue; }
        usados.add(bloque.lugar);
        if (ISO.test(dia.fecha || '')) {
          const r = revisarBloque(lugar, dia.fecha, bloque);
          if (r.nivel === 'error') inf.error(dondeB, r.mensaje);
          else if (r.nivel === 'aviso') inf.aviso(dondeB, r.mensaje);
        }
      } else if (tipo === 'traslado') {
        if (bloque.modo && !MODOS.includes(bloque.modo)) inf.error(dondeB, `modo "${bloque.modo}" no válido (${MODOS.join(' | ')})`);
        for (const extremo of ['desde', 'hasta']) {
          const ref = bloque[extremo];
          if (!esTexto(ref)) { inf.error(dondeB, `un traslado necesita "${extremo}"`); continue; }
          if (!lugares.has(ref)) inf.error(dondeB, `${extremo} referencia a un lugar inexistente: "${ref}"`);
          else usados.add(ref);
        }
      } else if (tipo === 'hito') {
        if (!esTexto(bloque.titulo)) inf.error(dondeB, 'un hito necesita "titulo"');
      }
    }
  }

  if (ISO.test(fechas.inicio || '') && ISO.test(fechas.fin || '')) {
    for (const iso of diasEntre(fechas.inicio, fechas.fin)) {
      if (!fechasVistas.has(iso)) inf.aviso('dias', `no hay entrada para el ${iso}: quedará un hueco en la barra de días`);
    }
  }

  for (const id of lugares.keys()) {
    if (!usados.has(id)) inf.aviso(`lugares ${id}`, 'no aparece en ningún día: no se verá en ninguna línea de tiempo');
  }

  // --- Listas (las claves persisten en el navegador: no pueden chocar) ---
  const idsLista = new Set();
  for (const [i, lista] of (viaje.listas || []).entries()) {
    if (!esTexto(lista?.titulo)) inf.error(`listas[${i}]`, 'falta titulo');
    for (const [j, item] of (lista?.items || []).entries()) {
      const donde = `listas[${i}].items[${j}]`;
      if (!esTexto(item?.id) || !KEBAB.test(item.id)) { inf.error(donde, 'id ausente o no está en kebab-case'); continue; }
      if (idsLista.has(item.id)) inf.error(donde, `id duplicado entre listas: "${item.id}" — se pisarían al guardarse`);
      idsLista.add(item.id);
      if (!esTexto(item.texto)) inf.error(donde, 'falta texto');
    }
  }

  // --- Transporte y avisos ----------------------------------------------
  for (const [i, t] of (viaje.transporte || []).entries()) {
    if (!esTexto(t?.tramo)) inf.error(`transporte[${i}]`, 'falta tramo');
    if (t?.modo && !MODOS.includes(t.modo)) inf.error(`transporte[${i}]`, `modo "${t.modo}" no válido`);
  }
  for (const [i, a] of (viaje.avisos || []).entries()) {
    if (!esTexto(a?.titulo) || !esTexto(a?.texto)) inf.error(`avisos[${i}]`, 'necesita titulo y texto');
    if (a?.nivel && !['alto', 'medio', 'info'].includes(a.nivel)) inf.error(`avisos[${i}]`, `nivel "${a.nivel}" no válido`);
  }

  return { informe: inf, lugares: lugares.size, dias: (viaje.dias || []).length };
}

/** El registro y los archivos de viaje se pueden desincronizar. Aquí se comprueba. */
function validarRegistro(registro, viajesPorId) {
  const inf = new Informe('data/viajes.json (registro)');
  if (!Array.isArray(registro.viajes)) {
    inf.error('raíz', 'viajes debe ser una lista');
    return inf;
  }
  const vistos = new Set();
  for (const [i, entrada] of registro.viajes.entries()) {
    const donde = `viajes[${i}]${entrada?.id ? ` ${entrada.id}` : ''}`;
    if (!esTexto(entrada?.id)) { inf.error(donde, 'falta id'); continue; }
    if (vistos.has(entrada.id)) inf.error(donde, `id duplicado en el registro: "${entrada.id}"`);
    vistos.add(entrada.id);

    const ruta = entrada.archivo || `data/viajes/${entrada.id}.json`;
    if (!existsSync(join(RAIZ, ruta))) { inf.error(donde, `el archivo del viaje no existe: ${ruta}`); continue; }

    const viaje = viajesPorId.get(entrada.id);
    if (!viaje) continue;
    for (const campo of ['titulo', 'subtitulo', 'estado']) {
      if (entrada[campo] !== undefined && entrada[campo] !== viaje[campo]) {
        inf.error(donde, `"${campo}" no coincide con el archivo del viaje: "${entrada[campo]}" vs "${viaje[campo]}"`);
      }
    }
    for (const campo of ['inicio', 'fin']) {
      if (entrada.fechas?.[campo] && entrada.fechas[campo] !== viaje.fechas?.[campo]) {
        inf.error(donde, `fechas.${campo} no coincide: "${entrada.fechas[campo]}" vs "${viaje.fechas?.[campo]}"`);
      }
    }
  }
  for (const id of viajesPorId.keys()) {
    if (!vistos.has(id)) inf.error('viajes', `el viaje "${id}" existe en data/viajes/ pero no está en el registro: no aparecerá en la portada`);
  }
  return inf;
}

// --- Ejecución -----------------------------------------------------------
const argumento = process.argv[2];
const dirViajes = join(RAIZ, 'data', 'viajes');

let archivos = readdirSync(dirViajes)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .map((f) => join(dirViajes, f));

if (argumento) {
  const objetivo = argumento.endsWith('.json') ? resolve(argumento) : join(dirViajes, `${argumento}.json`);
  if (!existsSync(objetivo)) {
    console.error(c.rojo(`No existe: ${objetivo}`));
    process.exit(2);
  }
  archivos = [objetivo];
}

console.log(c.fuerte('Validando Bitácora') + c.gris(`  ·  ${archivos.length} viaje(s)`));

let totalErrores = 0;
let totalAvisos = 0;
const viajesPorId = new Map();

for (const archivo of archivos) {
  let viaje;
  try {
    viaje = JSON.parse(readFileSync(archivo, 'utf8'));
  } catch (e) {
    console.log(`\n${c.fuerte(basename(archivo))}`);
    console.log(`  ${c.rojo('ERROR')}  ${c.gris('JSON')}  no se puede leer: ${e.message}`);
    totalErrores += 1;
    continue;
  }
  if (viaje.id) viajesPorId.set(viaje.id, viaje);
  const { informe, lugares, dias } = validarViaje(viaje, archivo.replace(RAIZ + '\\', '').replace(RAIZ + '/', '').replace(/\\/g, '/'));
  informe.etiqueta += c.gris(`   ${dias} días · ${lugares} lugares`);
  informe.imprimir();
  totalErrores += informe.errores.length;
  totalAvisos += informe.avisos.length;
}

if (!argumento) {
  try {
    const registro = JSON.parse(readFileSync(join(RAIZ, 'data', 'viajes.json'), 'utf8'));
    const inf = validarRegistro(registro, viajesPorId);
    inf.imprimir();
    totalErrores += inf.errores.length;
    totalAvisos += inf.avisos.length;
  } catch (e) {
    console.log(`\n${c.fuerte('data/viajes.json')}`);
    console.log(`  ${c.rojo('ERROR')}  ${c.gris('JSON')}  ${e.message}`);
    totalErrores += 1;
  }
}

console.log('');
if (totalErrores === 0) {
  console.log(c.verde(`✓ Sin errores`) + c.gris(totalAvisos ? `  ·  ${totalAvisos} aviso(s)` : ''));
  process.exit(0);
}
console.log(c.rojo(`✗ ${totalErrores} error(es)`) + c.gris(`  ·  ${totalAvisos} aviso(s)`));
process.exit(1);
