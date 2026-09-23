/**
 * Portada: Mis viajes.
 *
 * Tiene que decir en cinco segundos qué es esto y dónde está cada viaje. Por
 * eso el orden: el nombre y lo que hace, un solo botón para empezar uno, y los
 * viajes como tarjetas con su foto, sus fechas, su recorrido y cómo van.
 *
 * Las tarjetas se pintan **al momento** con lo que dice el registro, y la foto
 * y el progreso llegan después, viaje a viaje: la portada no espera a leer
 * todos los JSON para aparecer.
 *
 * El orden de los viajes es el de uso: el que está en curso primero, después
 * los que vienen —el más cercano antes—, y al final los que ya fueron.
 */

import { html, esc, icono, crudo, plural, $, $$, alPulsar } from '../ui/dom.js';
import { cargarRegistro, resumenDeViaje, olvidarRegistro, ESTADOS_VIAJE } from '../datos.js';
import { guardarViajeLocal } from '../estado.js';
import { diasEntre, aFecha, aIso, NOMBRE_MES } from '../horarios.js';
import { idDesdeNombre } from '../personalizacion.js';
import { buscar as buscarSitio } from '../ui/buscar-lugar.js';
import { brindis } from '../ui/brindis.js';

function rangoTexto(fechas) {
  const a = aFecha(fechas.inicio);
  const b = aFecha(fechas.fin);
  const mismoMes = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (mismoMes) return `${a.getDate()}–${b.getDate()} de ${NOMBRE_MES[b.getMonth()]} de ${b.getFullYear()}`;
  return `${a.getDate()} de ${NOMBRE_MES[a.getMonth()]} – ${b.getDate()} de ${NOMBRE_MES[b.getMonth()]} de ${b.getFullYear()}`;
}

/** Lo que dice la etiqueta de la foto: dónde está el viaje respecto a hoy. */
function cuandoTexto(v) {
  const hoy = aIso(new Date());
  if (v.estadoReal === 'en-curso') {
    const n = diasEntre(v.fechas.inicio, hoy).length;
    const total = diasEntre(v.fechas.inicio, v.fechas.fin).length;
    return `En curso · día ${n} de ${total}`;
  }
  if (v.estadoReal === 'planificado') {
    const faltan = diasEntre(hoy, v.fechas.inicio).length - 1;
    return faltan === 1 ? 'Empieza mañana' : `Faltan ${faltan} días`;
  }
  return (ESTADOS_VIAJE[v.estadoReal] || ESTADOS_VIAJE.completado).etiqueta;
}

const ACCION = { 'en-curso': 'Continuar el viaje', planificado: 'Seguir planificando', completado: 'Ver el viaje' };

const ORDEN_ESTADO = { 'en-curso': 0, planificado: 1, completado: 2 };
function ordenar(viajes) {
  return [...viajes].sort((a, b) => {
    const e = ORDEN_ESTADO[a.estadoReal] - ORDEN_ESTADO[b.estadoReal];
    if (e) return e;
    // Los que vienen, el más cercano primero; los que fueron, el más reciente.
    return a.estadoReal === 'planificado'
      ? a.fechas.inicio.localeCompare(b.fechas.inicio)
      : b.fechas.inicio.localeCompare(a.fechas.inicio);
  });
}

function tarjeta(v, i) {
  const dias = diasEntre(v.fechas.inicio, v.fechas.fin).length;
  return html`
    <a class="viaje" href="#/v/${v.id}" data-viaje="${v.id}" data-estado="${v.estadoReal}" style="animation-delay:${i * 45}ms">
      <div class="viaje__imagen" data-imagen>
        <span class="viaje__cuando">${cuandoTexto(v)}</span>
      </div>
      <div class="viaje__texto">
        <h2 class="viaje__titulo">${v.titulo}</h2>
        ${v.subtitulo ? crudo(`<p class="viaje__sub secundario">${esc(v.subtitulo)}</p>`) : ''}
        <p class="viaje__fechas">${plural(dias, 'día')} · ${rangoTexto(v.fechas)}</p>
        <p class="viaje__ruta menudo" data-ruta></p>
        <div class="viaje__progreso" data-progreso></div>
        <span class="viaje__accion">${ACCION[v.estadoReal] || 'Abrir'}${icono('adelante')}</span>
      </div>
      ${v.local ? crudo('<span class="viaje__local menudo" title="Creado en este navegador. Se publica en la nube desde la portada del viaje.">Solo en este navegador</span>') : ''}
    </a>`;
}

/** La foto, el recorrido y el progreso de una tarjeta, cuando llegan. */
async function completar(raiz, v) {
  const nodo = $(`[data-viaje="${v.id}"]`, raiz);
  if (!nodo) return;
  let r;
  try {
    r = await resumenDeViaje(v);
  } catch {
    return;   // sin el JSON la tarjeta sigue sirviendo: título, fechas y enlace
  }
  if (!r) return;

  const imagen = $('[data-imagen]', nodo);
  if (r.imagen) {
    const img = document.createElement('img');
    img.src = r.imagen.archivo;
    img.alt = `${r.imagen.nombre}, en ${v.titulo}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.title = r.imagen.credito || '';
    img.addEventListener('load', () => imagen.classList.add('viaje__imagen--lista'), { once: true });
    imagen.prepend(img);
  } else {
    imagen.classList.add('viaje__imagen--vacia');
  }

  const { zonas, mas } = r.recorrido;
  $('[data-ruta]', nodo).textContent = zonas.length ? `${zonas.join(' → ')}${mas ? ` y ${mas} más` : ''}` : '';

  const p = r.progreso;
  const progreso = $('[data-progreso]', nodo);
  if (!p.total) {
    progreso.innerHTML = html`<span class="menudo">Sin actividades todavía</span>`.toString();
    return;
  }
  // Planificando, lo que importa es cuánto está atado; de viaje o después, cuánto
  // se ha hecho. Las dos cifras salen del mismo estado que se pinta en el día.
  const planificando = v.estadoReal === 'planificado';
  const hechas = planificando ? p.organizadas : p.hechas;
  const pct = Math.round((hechas / p.total) * 100);
  progreso.innerHTML = html`
    <span class="viaje__barra" role="progressbar" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${hechas}"
          aria-label="${planificando ? 'Actividades organizadas' : 'Actividades hechas'}"><i style="width:${pct}%"></i></span>
    <span class="menudo"><b>${hechas}/${p.total}</b> ${planificando ? 'organizadas' : 'hechas'}${planificando && p.porReservar ? ` · ${plural(p.porReservar, 'por reservar', 'por reservar')}` : ''}</span>`.toString();
}

// --- Crear un viaje ---------------------------------------------------------

const MONEDAS = ['EUR', 'USD', 'GBP', 'CHF', 'CZK', 'JPY', 'MXN', 'PLN', 'HUF', 'DKK', 'SEK', 'NOK', 'TRY', 'MAD'];

/**
 * El viaje que se crea en el navegador: la misma forma que un JSON del
 * repositorio, con un día por fecha y nada más. Es lo que hace
 * `herramientas/nuevo-viaje.mjs` desde la línea de órdenes, sin salir de la aplicación.
 */
function nuevoViaje({ id, titulo, inicio, fin, moneda, centro }) {
  const fechas = diasEntre(inicio, fin);
  return {
    id,
    version: 1,
    titulo,
    subtitulo: '',
    estado: 'planificado',
    fechas: { inicio, fin },
    viajeros: [],
    moneda,
    base: '',
    resumen: '',
    mapa: { centro, zoom: centro ? 12 : 5 },
    avisos: [],
    lugares: [],
    dias: fechas.map((fecha, i) => ({
      fecha,
      titulo: i === 0 && fechas.length > 1 ? 'Llegada' : i === fechas.length - 1 && fechas.length > 1 ? 'Salida' : `Día ${i + 1}`,
      intensidad: i === 0 && fechas.length > 1 ? 'llegada' : i === fechas.length - 1 && fechas.length > 1 ? 'salida' : 'suave',
      bloques: [],
    })),
    transporte: [],
    listas: [],
    presupuesto: { nota: '', partidas: [] },
    fuentes: [],
  };
}

function abrirCrear(alCrear) {
  const hoy = aIso(new Date());
  const fondo = document.createElement('div');
  fondo.className = 'buscador-fondo';
  fondo.innerHTML = html`
    <form class="anadir crear" role="dialog" aria-modal="true" aria-labelledby="crear-titulo" novalidate>
      <div class="anadir__cabecera">
        <h2 class="titulo-2" id="crear-titulo">Crear un viaje</h2>
        <button type="button" class="icono-boton" data-cerrar aria-label="Cerrar">${icono('cerrar')}</button>
      </div>
      <div class="crear__campos">
        <label class="campo campo--ancho">
          <span class="etiqueta">Destino</span>
          <input type="text" name="titulo" required maxlength="60" placeholder="Japón, Lisboa, la costa de Amalfi…" autocomplete="off">
        </label>
        <label class="campo">
          <span class="etiqueta">Del</span>
          <input type="date" name="inicio" required min="2000-01-01" value="${hoy}">
        </label>
        <label class="campo">
          <span class="etiqueta">Al</span>
          <input type="date" name="fin" required min="2000-01-01" value="${hoy}">
        </label>
        <label class="campo campo--ancho">
          <span class="etiqueta">Moneda</span>
          <select name="moneda">${MONEDAS.map((m) => html`<option value="${m}">${m}</option>`)}</select>
        </label>
        <p class="menudo campo--ancho crear__error" data-error role="alert"></p>
        <p class="menudo campo--ancho">
          Se guarda en este navegador. Para compartirlo con quien viaja contigo, publícalo en la
          nube desde la portada del viaje.
        </p>
      </div>
      <div class="anadir__pie">
        <button type="button" class="boton boton--fantasma" data-cerrar>Cancelar</button>
        <button type="submit" class="boton boton--principal">${icono('mas')}Crear viaje</button>
      </div>
    </form>`.toString();
  document.body.appendChild(fondo);

  const forma = $('form', fondo);
  const error = $('[data-error]', fondo);
  const cerrar = () => fondo.remove();
  $('[name="titulo"]', fondo).focus();

  fondo.addEventListener('click', (e) => {
    if (e.target === fondo || e.target.closest('[data-cerrar]')) cerrar();
  });
  fondo.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });

  forma.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(forma));
    const titulo = String(datos.titulo || '').trim();
    const dias = datos.inicio && datos.fin ? diasEntre(datos.inicio, datos.fin).length : 0;
    let problema = '';
    if (!titulo) problema = 'Falta el destino.';
    else if (!datos.inicio || !datos.fin) problema = 'Faltan las fechas.';
    else if (datos.fin < datos.inicio) problema = 'La vuelta es antes que la ida.';
    else if (dias > 90) problema = 'Son más de 90 días. Si de verdad es tan largo, divídelo en varios viajes.';
    if (problema) { error.textContent = problema; return; }

    const boton = $('[type="submit"]', forma);
    boton.disabled = true;
    boton.lastChild.textContent = 'Creando…';

    // El centro del mapa sale de buscar el destino. Si no hay conexión, el viaje
    // se crea igual y el mapa arranca en la vista de Europa: la primera
    // actividad que se añada lo centra.
    let centro = null;
    try {
      const control = new AbortController();
      const reloj = setTimeout(() => control.abort(), 4000);
      const [primero] = await buscarSitio(titulo, null, control.signal);
      clearTimeout(reloj);
      if (primero?.coords) centro = primero.coords.map((n) => Number(n.toFixed(4)));
    } catch { /* sin conexión: se crea sin centro */ }

    const registro = await cargarRegistro();
    const usados = new Set(registro.viajes.map((v) => v.id));
    const id = idDesdeNombre(`${titulo} ${datos.inicio.slice(0, 7)}`, usados);
    const doc = nuevoViaje({ id, titulo, inicio: datos.inicio, fin: datos.fin, moneda: datos.moneda || 'EUR', centro });
    if (!guardarViajeLocal(doc)) {
      error.textContent = 'No se ha podido guardar en este navegador. ¿Está lleno o en modo privado?';
      boton.disabled = false;
      boton.lastChild.textContent = 'Crear viaje';
      return;
    }
    cerrar();
    alCrear(doc);
  });
}

// --- Montaje ------------------------------------------------------------------

export async function montarRegistro(raiz) {
  const registro = await cargarRegistro();
  const viajes = ordenar(registro.viajes);

  raiz.className = 'registro scroll-y';
  raiz.innerHTML = html`
    <div class="registro__interior">
      <header class="inicio">
        <div class="inicio__cima">
          <span class="inicio__marca">Bitácora</span>
          <a class="icono-boton" href="#/perfil" aria-label="Tus datos y tu cuenta" title="Tus datos">${icono('persona')}</a>
        </div>
        <h1 class="inicio__lema">Planifica, organiza y visualiza tu viaje en un solo sitio.</h1>
        <p class="inicio__sub secundario">El itinerario por días, el mapa y las reservas, juntos. Y durante el viaje, lo que toca ahora.</p>
        <button type="button" class="boton boton--principal boton--grande inicio__crear" data-accion="crear-viaje">
          ${icono('mas')}Crear viaje
        </button>
      </header>

      ${viajes.length ? html`
        <section class="viajes" aria-labelledby="viajes-titulo">
          <h2 class="etiqueta viajes__titulo" id="viajes-titulo">Tus viajes</h2>
          <div class="viajes__rejilla">${viajes.map(tarjeta)}</div>
        </section>` : html`
        <div class="vacio">
          ${icono('maleta')}
          <p class="secundario">Todavía no hay ningún viaje.</p>
          <p class="menudo" style="margin-top:8px">Empieza por el destino y las fechas: los días se crean solos.</p>
        </div>`}

      <footer class="inicio__pie">
        <p class="menudo">
          Lo visitado, las notas y las fotos viven en este navegador. Los viajes del
          repositorio están en <code>data/viajes/</code>.
        </p>
      </footer>
    </div>`.toString();

  alPulsar(raiz, '[data-accion="crear-viaje"]', () => abrirCrear((doc) => {
    olvidarRegistro();
    brindis(`${doc.titulo}: ${plural(doc.dias.length, 'día creado', 'días creados')}`, { tipo: 'ok' });
    location.hash = `#/v/${doc.id}`;
  }));

  for (const v of viajes) completar(raiz, v);

  return { destruir() { $$('.buscador-fondo').forEach((n) => n.remove()); } };
}
