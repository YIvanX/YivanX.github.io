/**
 * Los tres formularios de planificar: una actividad, una reserva y un gasto.
 *
 * Solo recogen datos y los devuelven: guardar es cosa de `viaje.js`, que sabe
 * si una actividad viene del archivo —y entonces se guarda como cambio en la
 * capa— o se añadió a mano. Así el formulario es el mismo para añadir y para
 * editar, y no hay dos que puedan discrepar.
 *
 * Diálogos de verdad para lectores de pantalla: `role="dialog"`, título
 * enlazado, Escape cierra, y al cerrar el foco vuelve a donde estaba.
 */

import { html, icono, $, $$ } from './dom.js';
import { CATEGORIAS } from '../datos.js';
import { categoriaDesdeOsm } from '../personalizacion.js';
import {
  TIPOS, TIPOS_RESERVA, CATEGORIAS_GASTO, ESTADOS, tipoDeBloque, duracionDeBloque, necesitaReserva, esActividad,
} from '../actividades.js';
import { aMinutos, aHora, fechaLarga, aIso } from '../horarios.js';
import { buscar } from './buscar-lugar.js';

const ESPERA_TECLEO = 450;

/** Las categorías que se eligen a mano: las de un «lugar», que puede ser muchas cosas. */
const CATEGORIAS_DE_LUGAR = ['patrimonio', 'naturaleza', 'pueblo', 'practico'];

// --- El diálogo --------------------------------------------------------------

function abrirDialogo({ id, titulo, cuerpo, pie }) {
  const antes = document.activeElement;
  const fondo = document.createElement('div');
  fondo.className = 'buscador-fondo';
  fondo.innerHTML = html`
    <form class="anadir editor" role="dialog" aria-modal="true" aria-labelledby="${id}" novalidate>
      <div class="anadir__cabecera">
        <h2 class="titulo-2" id="${id}">${titulo}</h2>
        <button type="button" class="icono-boton" data-cerrar aria-label="Cerrar">${icono('cerrar')}</button>
      </div>
      <div class="editor__cuerpo scroll-y">${cuerpo}</div>
      <div class="anadir__pie">${pie}</div>
    </form>`.toString();
  document.body.appendChild(fondo);
  const forma = $('form', fondo);

  const cerrar = () => {
    fondo.remove();
    if (antes && document.contains(antes)) antes.focus?.({ preventScroll: true });
  };
  fondo.addEventListener('click', (e) => {
    if (e.target === fondo || e.target.closest('[data-cerrar]')) cerrar();
  });
  fondo.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } });
  // El primer campo que se escribe, no la cruz de cerrar.
  requestAnimationFrame(() => $('input:not([type="hidden"]):not([disabled]), textarea, select', forma)?.focus());
  return { fondo, forma, cerrar, error: (texto) => { const n = $('[data-error]', forma); if (n) n.textContent = texto; } };
}

const valor = (forma, nombre) => forma.elements[nombre]?.value?.trim() ?? '';
const numero = (texto) => {
  if (texto === '' || texto === null || texto === undefined) return null;
  const n = Number(String(texto).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

/** Radios con icono: el tipo, el estado, la categoría. Mismo marcado para los tres. */
function opcionesConIcono(nombre, opciones, elegida, { etiqueta }) {
  return html`
    <fieldset class="campo campo--ancho opciones-icono">
      <legend class="etiqueta">${etiqueta}</legend>
      <div class="opciones-icono__lista">
        ${Object.entries(opciones).map(([id, o]) => html`
          <label class="opcion-icono">
            <input type="radio" name="${nombre}" value="${id}" ${id === elegida ? html`checked` : ''}>
            <span>${icono(o.icono)}${o.etiqueta}</span>
          </label>`)}
      </div>
    </fieldset>`;
}

function diasDelViaje(viaje, elegida) {
  return viaje.dias.map((d, i) => html`<option value="${d.fecha}" ${d.fecha === elegida ? html`selected` : ''}>Día ${i + 1} · ${fechaLarga(d.fecha)}</option>`);
}

// --- Actividad ------------------------------------------------------------------

/**
 * Añadir o editar una actividad.
 *
 * @param {object}   o
 * @param {object}   o.viaje
 * @param {string}   o.fecha           Día en el que se abre.
 * @param {?object}  o.bloque          El bloque que se edita; `null` para añadir.
 * @param {string}   o.estado          Su estado actual (de `estadoDeActividad`).
 * @param {number[]} o.centro          Sesgo del buscador.
 * @param {?object}  o.borrador        Lo que había escrito, al volver de elegir en el mapa.
 * @param {Function} o.alGuardar       Recibe los datos.
 * @param {Function} [o.alQuitar]      Quitar del día (archivo) o borrar (añadida).
 * @param {Function} o.alElegirEnMapa  Recibe el borrador; vuelve a abrir el editor con el punto.
 */
export function editarActividad({
  viaje, fecha, bloque = null, estado = 'pendiente', centro, borrador = null, alGuardar, alQuitar, alElegirEnMapa,
}) {
  const nueva = !bloque;
  const delArchivo = Boolean(bloque && !bloque.propio);
  const inicial = borrador || {
    tipo: bloque ? tipoDeBloque(bloque) : 'lugar',
    nombre: bloque?.lugar?.nombre || bloque?.titulo || '',
    elegido: bloque?.lugar ? { nombre: bloque.lugar.nombre, zona: bloque.lugar.zona || '', coords: bloque.lugar.coords, categoria: bloque.lugar.categoria } : null,
    categoria: bloque?.lugar?.categoria && CATEGORIAS_DE_LUGAR.includes(bloque.lugar.categoria) ? bloque.lugar.categoria : 'patrimonio',
    fecha: fecha || viaje.dias[0]?.fecha,
    inicio: bloque?.inicio || '10:00',
    duracion: duracionDeBloque(bloque) ?? 60,
    coste: bloque?.coste ?? '',
    url: bloque?.url || '',
    nota: bloque?.tipo === 'hito' ? (bloque.detalle || '') : (bloque?.nota || ''),
    estado: estado === 'requiere-reserva' ? 'pendiente' : estado,
    reserva: bloque ? necesitaReserva(bloque) : false,
  };

  const precioArchivo = bloque?.lugar?.precio?.importe;
  const titulo = nueva ? 'Añadir una actividad' : `Editar ${bloque.lugar?.nombre || bloque.titulo || 'actividad'}`;

  const { forma, cerrar, error } = abrirDialogo({
    id: 'editor-actividad',
    titulo,
    cuerpo: html`
      <div class="editor__campos">
        ${delArchivo ? '' : opcionesConIcono('tipo', TIPOS, inicial.tipo, { etiqueta: 'Tipo' })}

        <div class="campo campo--ancho" data-solo="sitio">
          <label class="etiqueta" for="ea-nombre">Nombre y ubicación</label>
          ${delArchivo ? html`
            <p class="editor__fijo"><b>${bloque.lugar.nombre}</b>${bloque.lugar.zona ? ` · ${bloque.lugar.zona}` : ''}</p>
            <p class="menudo">Viene del archivo del viaje, con su foto y su horario comprobados. El nombre y la ubicación se cambian allí.</p>`
          : html`
            <div class="buscador__campo editor__buscar">
              ${icono('buscar')}
              <input id="ea-nombre" name="nombre" type="search" value="${inicial.nombre}" autocomplete="off" spellcheck="false"
                     placeholder="Busca un sitio o escribe su nombre" aria-describedby="ea-elegido">
            </div>
            <p class="menudo editor__elegido" id="ea-elegido" data-elegido></p>
            <div class="editor__resultados" data-resultados role="listbox" aria-label="Resultados"></div>
            <button type="button" class="boton boton--fantasma editor__mapa" data-en-mapa>${icono('pin')}Elegir en el mapa</button>`}
        </div>

        <div class="campo campo--ancho" data-solo="nota">
          <label class="etiqueta" for="ea-titulo">Nota</label>
          <input id="ea-titulo" name="titulo" type="text" maxlength="120" value="${inicial.tipo === 'nota' ? inicial.nombre : ''}"
                 placeholder="Llamar al alojamiento, recoger las entradas…">
        </div>

        ${delArchivo ? '' : html`
        <label class="campo campo--ancho" data-solo="categoria">
          <span class="etiqueta">Qué es</span>
          <select name="categoria">
            ${CATEGORIAS_DE_LUGAR.map((k) => html`<option value="${k}" ${k === inicial.categoria ? html`selected` : ''}>${CATEGORIAS[k].etiqueta}</option>`)}
          </select>
        </label>`}

        <label class="campo campo--ancho">
          <span class="etiqueta">Día</span>
          <select name="fecha">${diasDelViaje(viaje, inicial.fecha)}</select>
        </label>
        <label class="campo">
          <span class="etiqueta">Hora</span>
          <input type="time" name="inicio" value="${inicial.inicio}" required>
        </label>
        <label class="campo" data-solo="sitio">
          <span class="etiqueta">Duración (min)</span>
          <input type="number" name="duracion" inputmode="numeric" min="0" max="1440" step="5" value="${inicial.duracion ?? ''}">
        </label>

        <label class="campo" data-solo="sitio">
          <span class="etiqueta">Coste por persona (${viaje.moneda || 'EUR'})</span>
          <input type="text" name="coste" inputmode="decimal" value="${inicial.coste}"
                 placeholder="${typeof precioArchivo === 'number' ? String(precioArchivo).replace('.', ',') : '0'}">
        </label>
        <label class="campo" data-solo="sitio">
          <span class="etiqueta">Web o entradas</span>
          <input type="url" name="url" inputmode="url" value="${inicial.url}" placeholder="https://">
        </label>

        <label class="campo campo--ancho">
          <span class="etiqueta">Notas</span>
          <textarea name="nota" rows="2" maxlength="400" placeholder="Qué no hay que olvidar">${inicial.nota}</textarea>
        </label>

        <div class="campo campo--ancho" data-solo="sitio">
          ${opcionesConIcono('estado', {
            pendiente: ESTADOS.pendiente, reservado: ESTADOS.reservado, hecho: ESTADOS.hecho, cancelado: ESTADOS.cancelado,
          }, inicial.estado, { etiqueta: 'Estado' })}
          <label class="casilla">
            <input type="checkbox" name="reserva" ${inicial.reserva ? html`checked` : ''}>
            <span>Necesita reserva</span>
          </label>
        </div>

        <p class="menudo campo--ancho crear__error" data-error role="alert"></p>
      </div>`,
    pie: html`
      ${alQuitar ? html`<button type="button" class="boton boton--peligro" data-quitar>${icono('papelera')}${delArchivo ? 'Quitar del día' : 'Borrar'}</button>` : ''}
      <button type="submit" class="boton boton--principal">${icono('check')}${nueva ? 'Añadir' : 'Guardar'}</button>`,
  });

  // --- Lo que se enseña según el tipo
  let elegido = inicial.elegido;
  const pintarElegido = () => {
    const n = $('[data-elegido]', forma);
    if (!n) return;
    n.textContent = elegido?.coords
      ? `Ubicación: ${elegido.zona || `${elegido.coords[0].toFixed(4)}, ${elegido.coords[1].toFixed(4)}`}`
      : 'Elige un resultado o toca el mapa para situarlo.';
  };
  const tipoActual = () => (delArchivo ? tipoDeBloque(bloque) : forma.elements.tipo?.value || 'lugar');
  const repartir = () => {
    const tipo = tipoActual();
    const esNota = tipo === 'nota';
    for (const n of $$('[data-solo="sitio"]', forma)) n.hidden = esNota;
    for (const n of $$('[data-solo="nota"]', forma)) n.hidden = !esNota || delArchivo;
    for (const n of $$('[data-solo="categoria"]', forma)) n.hidden = tipo !== 'lugar';
  };
  forma.addEventListener('change', (e) => { if (e.target.name === 'tipo') repartir(); });
  repartir();
  pintarElegido();

  // --- Buscar el sitio
  const campo = forma.elements.nombre;
  const caja = $('[data-resultados]', forma);
  let resultados = [];
  let temporizador = null;
  let control = null;
  campo?.addEventListener('input', () => {
    clearTimeout(temporizador);
    control?.abort();
    const consulta = campo.value.trim();
    if (consulta.length < 3) { caja.innerHTML = ''; return; }
    caja.innerHTML = html`<p class="anadir__pista menudo">Buscando…</p>`.toString();
    temporizador = setTimeout(async () => {
      control = new AbortController();
      try {
        resultados = await buscar(consulta, centro, control.signal);
        caja.innerHTML = resultados.length
          ? resultados.map((r, i) => html`
              <button type="button" class="anadir__resultado" data-i="${i}" role="option">
                ${icono((CATEGORIAS[categoriaDesdeOsm(r.osm?.clave, r.osm?.valor)] || CATEGORIAS.practico).icono)}
                <span><span class="titulo-3">${r.nombre}</span><span class="menudo" style="display:block">${r.zona}</span></span>
              </button>`).join('')
          : html`<p class="anadir__pista menudo">Nada encontrado. Puedes situarlo tocando el mapa.</p>`.toString();
      } catch (err) {
        if (err.name === 'AbortError') return;
        caja.innerHTML = html`<p class="anadir__pista menudo">${navigator.onLine ? 'No se ha podido buscar.' : 'Sin conexión: sitúalo tocando el mapa.'}</p>`.toString();
      }
    }, ESPERA_TECLEO);
  });
  caja?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const r = resultados[Number(b.dataset.i)];
    elegido = { ...r, categoria: categoriaDesdeOsm(r.osm?.clave, r.osm?.valor) };
    campo.value = r.nombre;
    caja.innerHTML = '';
    if (forma.elements.categoria && CATEGORIAS_DE_LUGAR.includes(elegido.categoria)) forma.elements.categoria.value = elegido.categoria;
    pintarElegido();
  });

  const leer = () => ({
    tipo: tipoActual(),
    nombre: delArchivo ? bloque.lugar.nombre : (tipoActual() === 'nota' ? valor(forma, 'titulo') : valor(forma, 'nombre')),
    elegido,
    categoria: forma.elements.categoria?.value || null,
    fecha: valor(forma, 'fecha'),
    inicio: valor(forma, 'inicio'),
    duracion: valor(forma, 'duracion'),
    coste: valor(forma, 'coste'),
    url: valor(forma, 'url'),
    nota: valor(forma, 'nota'),
    estado: forma.elements.estado?.value || 'pendiente',
    reserva: Boolean(forma.elements.reserva?.checked),
  });

  $('[data-en-mapa]', forma)?.addEventListener('click', () => {
    const b = leer();
    cerrar();
    alElegirEnMapa?.(b);
  });
  $('[data-quitar]', forma)?.addEventListener('click', () => { cerrar(); alQuitar(); });

  forma.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = leer();
    const esNota = d.tipo === 'nota';
    const coste = numero(d.coste);
    const duracion = numero(d.duracion);
    let problema = '';
    if (!d.inicio) problema = 'Falta la hora.';
    else if (esNota && !d.nombre) problema = 'Escribe la nota.';
    else if (!esNota && !delArchivo && !d.nombre) problema = 'Falta el nombre.';
    else if (!esNota && !delArchivo && !elegido?.coords) problema = 'Falta situarlo: elige un resultado o tócalo en el mapa.';
    else if (Number.isNaN(coste) || (coste !== null && coste < 0)) problema = 'El coste tiene que ser un número.';
    else if (Number.isNaN(duracion) || (duracion !== null && duracion < 0)) problema = 'La duración son minutos.';
    else if (d.url && !/^https?:\/\//i.test(d.url)) problema = 'La web tiene que empezar por http:// o https://.';
    if (problema) { error(problema); return; }

    const fin = duracion ? aHora(aMinutos(d.inicio) + duracion) : null;
    cerrar();
    alGuardar({ ...d, coste, duracion, fin, nueva, delArchivo });
  });
}

// --- Reserva ------------------------------------------------------------------------

/**
 * Añadir o editar una reserva. El localizador es lo que se enseña en la puerta,
 * y por eso va en su propio campo, sin corrector ni mayúsculas automáticas.
 */
export function editarReserva({ viaje, reserva = null, previa = {}, alGuardar, alBorrar }) {
  const r = { tipo: 'hotel', fecha: viaje.dias[0]?.fecha, ...previa, ...(reserva || {}) };
  const actividades = viaje.dias.flatMap((d) => d.bloques.filter(esActividad).map((b) => ({ d, b })));
  const { forma, cerrar, error } = abrirDialogo({
    id: 'editor-reserva',
    titulo: reserva ? 'Editar la reserva' : 'Añadir una reserva',
    cuerpo: html`
      <div class="editor__campos">
        ${opcionesConIcono('tipo', TIPOS_RESERVA, r.tipo, { etiqueta: 'Qué es' })}
        <label class="campo campo--ancho">
          <span class="etiqueta">Nombre</span>
          <input type="text" name="nombre" maxlength="120" value="${r.nombre || ''}" placeholder="Hotel, vuelo, restaurante…" required>
        </label>
        <label class="campo">
          <span class="etiqueta">Fecha</span>
          <input type="date" name="fecha" value="${r.fecha || ''}">
        </label>
        <label class="campo">
          <span class="etiqueta">Hora</span>
          <input type="time" name="hora" value="${r.hora || ''}">
        </label>
        <label class="campo campo--ancho" data-solo-hotel>
          <span class="etiqueta">Salida</span>
          <input type="date" name="hasta" value="${r.hasta || ''}">
        </label>
        <label class="campo campo--ancho">
          <span class="etiqueta">Número de reserva</span>
          <input type="text" name="localizador" maxlength="60" value="${r.localizador || ''}" class="editor__localizador"
                 autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123">
        </label>
        <label class="campo campo--ancho">
          <span class="etiqueta">Dónde</span>
          <input type="text" name="lugar" maxlength="200" value="${r.lugar || ''}" placeholder="Dirección, terminal, estación…">
        </label>
        <label class="campo campo--ancho">
          <span class="etiqueta">Web o confirmación</span>
          <input type="url" name="url" inputmode="url" value="${r.url || ''}" placeholder="https://">
        </label>
        <label class="campo campo--ancho">
          <span class="etiqueta">Actividad del itinerario</span>
          <select name="actividad">
            <option value="">Ninguna</option>
            ${actividades.map(({ d, b }) => html`<option value="${b.claveActividad}" ${b.claveActividad === r.actividad ? html`selected` : ''}>${fechaLarga(d.fecha)} · ${b.inicio || ''} ${b.lugar.nombre}</option>`)}
          </select>
        </label>
        <label class="campo campo--ancho">
          <span class="etiqueta">Notas</span>
          <textarea name="notas" rows="2" maxlength="400">${r.notas || ''}</textarea>
        </label>
        <p class="menudo campo--ancho">
          Se guarda en este navegador y, si el viaje está en la nube, lo ven solo sus miembros.
          Nunca va al repositorio.
        </p>
        <p class="menudo campo--ancho crear__error" data-error role="alert"></p>
      </div>`,
    pie: html`
      ${reserva && alBorrar ? html`<button type="button" class="boton boton--peligro" data-borrar>${icono('papelera')}Borrar</button>` : ''}
      <button type="submit" class="boton boton--principal">${icono('check')}Guardar</button>`,
  });
  const repartir = () => { $('[data-solo-hotel]', forma).hidden = forma.elements.tipo.value !== 'hotel'; };
  forma.addEventListener('change', (e) => { if (e.target.name === 'tipo') repartir(); });
  repartir();
  $('[data-borrar]', forma)?.addEventListener('click', () => { cerrar(); alBorrar(); });

  forma.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(['tipo', 'nombre', 'fecha', 'hora', 'hasta', 'localizador', 'lugar', 'url', 'actividad', 'notas']
      .map((k) => [k, valor(forma, k)]));
    if (d.tipo !== 'hotel') d.hasta = '';
    if (!d.nombre) { error('Falta el nombre.'); return; }
    if (d.url && !/^https?:\/\//i.test(d.url)) { error('La web tiene que empezar por http:// o https://.'); return; }
    if (d.hasta && d.fecha && d.hasta < d.fecha) { error('La salida es antes que la entrada.'); return; }
    // Lo vacío no se guarda: una reserva sin hora no tiene `hora: ""`.
    const limpio = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== ''));
    cerrar();
    alGuardar(limpio);
  });
}

// --- Gasto ------------------------------------------------------------------------------

export function editarGasto({ viaje, gasto = null, previa = {}, alGuardar, alBorrar }) {
  const hoy = aIso(new Date());
  const enViaje = viaje.dias.some((d) => d.fecha === hoy);
  const g = { categoria: 'comida', fecha: enViaje ? hoy : viaje.dias[0]?.fecha, ...previa, ...(gasto || {}) };
  const { forma, cerrar, error } = abrirDialogo({
    id: 'editor-gasto',
    titulo: gasto ? 'Editar el gasto' : 'Apuntar un gasto',
    cuerpo: html`
      <div class="editor__campos">
        <label class="campo campo--ancho">
          <span class="etiqueta">Importe (${viaje.moneda || 'EUR'})</span>
          <input type="text" name="importe" inputmode="decimal" value="${g.importe !== undefined ? String(g.importe).replace('.', ',') : ''}"
                 placeholder="0,00" required class="editor__importe">
        </label>
        <label class="campo campo--ancho">
          <span class="etiqueta">Concepto</span>
          <input type="text" name="concepto" maxlength="120" value="${g.concepto || ''}" placeholder="Cena, taxi, entradas…">
        </label>
        ${opcionesConIcono('categoria', CATEGORIAS_GASTO, g.categoria, { etiqueta: 'Categoría' })}
        <label class="campo campo--ancho">
          <span class="etiqueta">Día</span>
          <select name="fecha">${diasDelViaje(viaje, g.fecha)}</select>
        </label>
        <p class="menudo campo--ancho crear__error" data-error role="alert"></p>
      </div>`,
    pie: html`
      ${gasto && alBorrar ? html`<button type="button" class="boton boton--peligro" data-borrar>${icono('papelera')}Borrar</button>` : ''}
      <button type="submit" class="boton boton--principal">${icono('check')}Guardar</button>`,
  });
  $('[data-borrar]', forma)?.addEventListener('click', () => { cerrar(); alBorrar(); });
  forma.addEventListener('submit', (e) => {
    e.preventDefault();
    const importe = numero(valor(forma, 'importe'));
    if (importe === null || Number.isNaN(importe) || importe <= 0) { error('Escribe el importe, por ejemplo 12,50.'); return; }
    cerrar();
    alGuardar({
      importe: Math.round(importe * 100) / 100,
      concepto: valor(forma, 'concepto') || CATEGORIAS_GASTO[forma.elements.categoria.value]?.etiqueta || 'Gasto',
      categoria: forma.elements.categoria.value,
      fecha: valor(forma, 'fecha'),
      ...(g.actividad ? { actividad: g.actividad } : {}),
    });
  });
}

export const cerrarEditores = () => $$('.editor').forEach((n) => n.closest('.buscador-fondo')?.remove());
