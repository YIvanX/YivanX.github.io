/**
 * Hoy: el viaje visto desde la calle.
 *
 * El itinerario contesta «¿qué hacemos el martes?». Esta vista contesta otra
 * pregunta, la que se hace veinte veces al día con el móvil en la mano: **qué
 * toca ahora, qué viene después y cómo se llega**. Por eso no enseña el día
 * entero con el mismo peso: lo de ahora va grande, lo siguiente con su botón de
 * «Cómo llegar», y lo demás en una lista corta.
 *
 * Tres casos, y los tres dicen algo útil en vez de quedarse en blanco:
 *
 *  · **Durante el viaje**, el día de hoy.
 *  · **Antes**, cuánto falta, cómo empieza y qué queda por dejar resuelto.
 *  · **Después**, cómo fue, y dónde guardar los recuerdos.
 *
 * Como `panel.js`, aquí solo se decide qué se enseña. Los eventos van en
 * `viaje.js`: el botón de «hecho» es el mismo `data-hecho` que en la cronología.
 */

import { html, esc, icono, crudo, plural, duracionTexto } from '../ui/dom.js';
import { MODOS } from '../datos.js';
import {
  aIso, aMinutos, aHora, fechaLarga, estadoEn, diasEntre,
} from '../horarios.js';
import { enlaceComoLlegar, enlaceTramo, enlaceLugar } from '../enlaces-mapa.js';
import {
  ESTADOS, estadoDeActividad, resumenDelDia, momentoDelDia, progresoDelViaje, esActividad, guardadoDe,
} from '../actividades.js';
import { listasDe, progresoDeListas } from '../agenda.js';
import { tiempoDelDia } from '../tiempo.js';
import {
  botonDeEstado, lineaDeDatos, pintarResumenDelDia, tiraDeTiempo, bandasDelDia, enlaceRuta, numeroDeDia,
} from './panel.js';

const minutosDe = (fecha) => fecha.getHours() * 60 + fecha.getMinutes();

/** «en 25 min», «en 1 h 10 min», «ahora». */
function dentroDe(minutos) {
  if (minutos <= 0) return 'ahora';
  return `en ${duracionTexto(minutos)}`;
}

/**
 * Qué dice el horario del sitio a esta hora. Solo se enseña si tiene horario:
 * una plaza no «cierra», y decir «abierto» de algo que no abre sería ruido.
 */
function situacionDelSitio(lugar, fecha, minutos) {
  const s = estadoEn(lugar, fecha, minutos);
  if (s.estado === 'abierto') return { texto: `Abierto hasta las ${aHora(s.cierra)}`, clase: 'ok' };
  if (s.estado === 'cerrado') return { texto: `Cerrado ahora · abre a las ${aHora(s.abre)}`, clase: 'alerta' };
  if (s.estado === 'cerrado-hoy') return { texto: 'Hoy no abre', clase: 'error' };
  return null;
}

/** El botón que se busca con el pulgar: indicaciones hasta el sitio, en su modo. */
function botonComoLlegar(lugar, modo) {
  const url = enlaceComoLlegar(lugar, modo);
  if (!url) return '';
  return html`
    <a class="boton boton--principal boton--grande" href="${url}" target="_blank" rel="noopener noreferrer">
      ${icono('localizar')}Cómo llegar
    </a>`;
}

function foto(lugar, clase) {
  if (!lugar?.imagen) return '';
  return crudo(`<img class="${clase}" src="${esc(lugar.imagen.archivo)}" alt="" loading="lazy" decoding="async"
    title="${esc(lugar.imagen.credito)}${lugar.imagen.licencia ? ' · ' + esc(lugar.imagen.licencia) : ''}">`);
}

// --- Las piezas del día ----------------------------------------------------

/** Lo que está pasando: una visita, un traslado o un hito. */
function tarjetaAhora(viaje, dia, bloque, minutos, actividad) {
  if (bloque.tipo === 'traslado') {
    const modo = MODOS[bloque.modo] || { etiqueta: 'Traslado', icono: 'adelante' };
    const quedan = aMinutos(bloque.fin) - minutos;
    // «Cómo llegar» desde donde estás, no desde el origen del tramo: de camino,
    // ya no estás en el origen. El modo sí es el del tramo.
    const destino = bloque.lugarHasta;
    const url = destino ? enlaceComoLlegar(destino, bloque.modo) : enlaceTramo(bloque.lugarDesde, bloque.lugarHasta, bloque.modo);
    const sitio = destino?.horarios ? situacionDelSitio(destino, dia.fecha, aMinutos(bloque.fin)) : null;
    return html`
      <section class="hoy-ahora hoy-ahora--camino" aria-labelledby="hoy-ahora">
        ${foto(destino, 'hoy-ahora__foto')}
        <p class="etiqueta hoy-ahora__marca" id="hoy-ahora">${icono(modo.icono)}De camino${bloque.fin ? ` · llegada a las ${bloque.fin}` : ''}</p>
        <h2 class="hoy-ahora__nombre">${destino
          ? html`<a href="#/v/${viaje.id}/l/${destino.id}?d=${dia.fecha}">${destino.nombre}</a>`
          : modo.etiqueta}</h2>
        <p class="secundario">${modo.etiqueta}${Number.isFinite(quedan) && quedan > 0 ? ` · ${dentroDe(quedan)}` : ''}${destino?.zona ? ` · ${destino.zona}` : ''}</p>
        ${sitio && sitio.clase !== 'ok' ? crudo(`<p class="hoy-sitio hoy-sitio--${sitio.clase}">${esc(sitio.texto)}</p>`) : ''}
        ${bloque.detalle ? crudo(`<p class="hoy-ahora__nota">${esc(bloque.detalle)}</p>`) : ''}
        ${url ? html`<div class="hoy-acciones">
          <a class="boton boton--principal boton--grande" href="${url}" target="_blank" rel="noopener noreferrer">${icono('localizar')}Cómo llegar</a>
        </div>` : ''}
      </section>`;
  }

  if (bloque.tipo === 'hito') {
    return html`
      <section class="hoy-ahora" aria-labelledby="hoy-ahora">
        <p class="etiqueta hoy-ahora__marca" id="hoy-ahora">${icono('reloj')}Ahora · ${bloque.inicio}</p>
        <h2 class="hoy-ahora__nombre">${bloque.titulo}</h2>
        ${bloque.detalle ? crudo(`<p class="hoy-ahora__nota">${esc(bloque.detalle)}</p>`) : ''}
      </section>`;
  }

  const lugar = bloque.lugar;
  const e = estadoDeActividad(bloque, actividad);
  const sitio = bloque.exterior ? null : situacionDelSitio(lugar, dia.fecha, minutos);
  return html`
    <section class="hoy-ahora" data-estado="${e}" aria-labelledby="hoy-ahora">
      ${foto(lugar, 'hoy-ahora__foto')}
      <div class="hoy-ahora__texto">
        <p class="etiqueta hoy-ahora__marca" id="hoy-ahora">Ahora · ${bloque.inicio}${bloque.fin ? `–${bloque.fin}` : ''}</p>
        <h2 class="hoy-ahora__nombre"><a href="#/v/${viaje.id}/l/${lugar.id}?d=${dia.fecha}">${lugar.nombre}</a></h2>
        <p class="menudo">${lineaDeDatos(bloque, viaje.moneda)}</p>
        ${sitio ? crudo(`<p class="hoy-sitio hoy-sitio--${sitio.clase}">${esc(sitio.texto)}</p>`) : ''}
        ${e === 'requiere-reserva' ? crudo('<p class="hoy-sitio hoy-sitio--alerta">Pide reserva y no está marcada</p>') : ''}
        ${bloque.nota ? crudo(`<p class="hoy-ahora__nota">${esc(bloque.nota)}</p>`) : ''}
        <div class="hoy-acciones">
          ${hechoGrande(bloque, e)}
          <a class="boton boton--grande" href="${enlaceLugar(lugar)}" target="_blank" rel="noopener noreferrer">${icono('pin')}Mapa</a>
        </div>
      </div>
    </section>`;
}

/** El «hecho» de la tarjeta grande: el mismo `data-hecho` que el del raíl. */
function hechoGrande(bloque, e) {
  if (e === 'cancelado') return html`<span class="chip">${icono('cerrar')}Cancelado</span>`;
  const hecho = e === 'hecho';
  return html`
    <button type="button" class="boton boton--grande ${hecho ? 'boton--hecho' : ''}" data-hecho="${bloque.lugar.id}"
            aria-pressed="${String(hecho)}">${icono('check')}${hecho ? 'Hecho' : 'Marcar hecho'}</button>`;
}

/** Lo siguiente: cuándo, qué, y cómo se llega. */
function tarjetaSiguiente(viaje, dia, bloque, llegada, minutos, actividad) {
  const lugar = bloque.lugar;
  const e = estadoDeActividad(bloque, actividad);
  const falta = aMinutos(bloque.inicio) - minutos;
  const modo = llegada ? MODOS[llegada.modo] : null;
  const tramo = llegada ? Math.max(0, aMinutos(llegada.fin) - aMinutos(llegada.inicio)) : 0;
  const sitio = bloque.exterior ? null : situacionDelSitio(lugar, dia.fecha, aMinutos(bloque.inicio));
  return html`
    <section class="hoy-siguiente" data-estado="${e}" aria-labelledby="hoy-siguiente">
      <p class="etiqueta" id="hoy-siguiente">Siguiente · ${bloque.inicio}${Number.isFinite(falta) ? ` · ${dentroDe(falta)}` : ''}</p>
      <div class="hoy-siguiente__fila">
        ${foto(lugar, 'hoy-siguiente__foto')}
        <div style="min-width:0">
          <h2 class="titulo-2"><a href="#/v/${viaje.id}/l/${lugar.id}?d=${dia.fecha}">${lugar.nombre}</a></h2>
          <p class="menudo">${lineaDeDatos(bloque, viaje.moneda)}</p>
          ${sitio && sitio.clase !== 'ok' ? crudo(`<p class="hoy-sitio hoy-sitio--${sitio.clase}">${esc(sitio.texto)}</p>`) : ''}
        </div>
      </div>
      ${modo ? html`<p class="hoy-llegada">${icono(modo.icono)}<span><b>${tramo ? `${duracionTexto(tramo)} · ` : ''}${modo.etiqueta}</b>${llegada.detalle ? crudo(` <span class="menudo">— ${esc(llegada.detalle)}</span>`) : ''}</span></p>` : ''}
      <div class="hoy-acciones">${botonComoLlegar(lugar, llegada?.modo)}</div>
    </section>`;
}

/** Lo que queda después de lo siguiente, en una fila por actividad. */
function listaCorta(viaje, dia, bloques, actividad) {
  if (!bloques.length) return '';
  return html`
    <ol class="hoy-lista">
      ${bloques.map((b) => {
        const e = estadoDeActividad(b, actividad);
        return html`
          <li class="hoy-fila" data-estado="${e}">
            <span class="hoy-fila__hora">${b.inicio || ''}</span>
            ${botonDeEstado(b, e)}
            <a class="hoy-fila__nombre" href="#/v/${viaje.id}/l/${b.lugar.id}?d=${dia.fecha}">
              <span class="titulo-3">${b.lugar.nombre}</span>
              <span class="menudo">${lineaDeDatos(b, viaje.moneda)}${e !== 'pendiente' ? ` · ${ESTADOS[e].etiqueta}` : ''}</span>
            </a>
          </li>`;
      })}
    </ol>`;
}

function pintarHoyDelViaje(viaje, dia, estado, { capa, tiempo, ahora }) {
  const minutos = minutosDe(ahora);
  const actividad = guardadoDe(estado, capa);
  const momento = momentoDelDia(dia, minutos, actividad);
  const resumen = resumenDelDia(dia, actividad);
  const zonas = [...new Set(dia.bloques.filter(esActividad).map((b) => b.lugar.zona).filter(Boolean))];

  // De camino a lo siguiente, el tramo y su destino son la misma tarjeta: dos
  // tarjetas con el mismo sitio y dos «Cómo llegar» eran ruido.
  const enCamino = momento.actual?.tipo === 'traslado' && momento.siguiente
    && momento.actual.lugarHasta?.id === momento.siguiente.lugar.id;
  // Lo que queda después de lo siguiente, sin repetirlo.
  const despues = momento.restantes.filter((b) => b !== momento.siguiente);
  const pendientesAtras = momento.pasadas.filter((b) => !['hecho', 'cancelado'].includes(estadoDeActividad(b, actividad)));
  const hechas = dia.bloques.filter(esActividad).filter((b) => estadoDeActividad(b, actividad) === 'hecho');

  let principal;
  if (momento.fase === 'sin-plan') {
    principal = html`<div class="vacio"><p class="secundario">Hoy no hay nada planificado.</p>
      <a class="boton" href="#/v/${viaje.id}/d/${dia.fecha}" style="margin-top:var(--e3)">${icono('mas')}Planificar el día</a></div>`;
  } else if (momento.fase === 'terminado') {
    const manana = viaje.dias[viaje.dias.indexOf(dia) + 1];
    principal = html`
      <section class="hoy-ahora hoy-ahora--fin">
        <p class="etiqueta hoy-ahora__marca">${icono('luna')}Día terminado</p>
        <h2 class="hoy-ahora__nombre">${resumen.hechas} de ${resumen.actividades} hechas</h2>
        ${manana ? html`<p class="secundario">Mañana: <a href="#/v/${viaje.id}/d/${manana.fecha}">${manana.titulo}</a></p>` : html`<p class="secundario">Era el último día del viaje.</p>`}
      </section>`;
  } else {
    principal = html`
      ${momento.actual ? tarjetaAhora(viaje, dia, momento.actual, minutos, actividad)
        : momento.fase === 'antes' ? html`
          <section class="hoy-ahora hoy-ahora--antes">
            <p class="etiqueta hoy-ahora__marca">${icono('sol')}Todavía no ha empezado</p>
            <h2 class="hoy-ahora__nombre">El día empieza a las ${aHora(resumen.desde)}</h2>
          </section>` : ''}
      ${momento.siguiente && !enCamino ? tarjetaSiguiente(viaje, dia, momento.siguiente, momento.llegada, minutos, actividad) : ''}`;
  }

  return html`
    <div class="hoy">
      <header class="hoy__cabecera">
        <p class="etiqueta hoy__fecha">Hoy · ${fechaLarga(dia.fecha)}</p>
        <h1 class="display" data-foco tabindex="-1">${dia.titulo}</h1>
        <p class="secundario">${viaje.titulo} · día ${numeroDeDia(viaje, dia.fecha)} de ${viaje.dias.length}${zonas.length ? ` · ${zonas.slice(0, 3).join(', ')}` : ''}</p>
        ${pintarResumenDelDia(resumen, viaje.moneda)}
        ${tiraDeTiempo(tiempoDelDia(tiempo, dia.fecha))}
      </header>

      ${viaje.pendientes ? crudo(`<p class="hoy-aviso-nube menudo">${esc(plural(viaje.pendientes, 'cambio'))} sin subir a la nube. Están a salvo en este móvil.</p>`) : ''}

      ${principal}

      ${pendientesAtras.length ? html`
        <details class="hoy-bloque hoy-plegable" data-banda="atras">
          <summary class="etiqueta">${`${pendientesAtras.length} de antes sin marcar`}</summary>
          <p class="menudo">Ya pasó su hora y no están marcadas como hechas. Márcalas si fuisteis.</p>
          ${listaCorta(viaje, dia, pendientesAtras, actividad)}
        </details>` : ''}

      ${despues.length ? html`
        <section class="hoy-bloque">
          <h2 class="etiqueta">Después</h2>
          ${listaCorta(viaje, dia, despues, actividad)}
        </section>` : ''}

      ${bandasDelDia(viaje, dia, estado, tiempoDelDia(tiempo, dia.fecha), capa)}

      ${hechas.length ? html`
        <details class="hoy-bloque hoy-plegable" data-banda="hechas">
          <summary class="etiqueta">${plural(hechas.length, 'hecha', 'hechas')}</summary>
          ${listaCorta(viaje, dia, hechas, actividad)}
        </details>` : ''}

      <div class="hoy-pie">
        <button type="button" class="boton" data-nuevo-gasto="" data-fecha="${dia.fecha}">${icono('gasto')}Apuntar un gasto</button>
        <a class="boton" href="#/v/${viaje.id}/d/${dia.fecha}">${icono('itinerario')}El día completo</a>
        ${enlaceRuta(dia)}
      </div>
    </div>`;
}

// --- Antes y después del viaje ---------------------------------------------

function pintarAntes(viaje, estado, { capa, ahora }) {
  const hoy = aIso(ahora);
  const faltan = diasEntre(hoy, viaje.fechas.inicio).length - 1;
  const primero = viaje.dias[0];
  const actividad = guardadoDe(estado, capa);
  const progreso = progresoDelViaje(viaje, actividad);
  const listas = progresoDeListas(listasDe(viaje, 'pre'), estado.tareas);
  const primera = primero?.bloques.find((b) => Number.isFinite(aMinutos(b.inicio)));

  return html`
    <div class="hoy">
      <header class="hoy__cabecera">
        <p class="etiqueta hoy__fecha">${faltan === 1 ? 'Mañana empieza' : `Faltan ${faltan} días`}</p>
        <h1 class="display" data-foco tabindex="-1">${viaje.titulo}</h1>
        <p class="secundario">${fechaLarga(viaje.fechas.inicio)} – ${fechaLarga(viaje.fechas.fin)} · ${plural(viaje.dias.length, 'día')}</p>
      </header>

      <section class="hoy-bloque">
        <h2 class="etiqueta">Antes de salir</h2>
        <ul class="hoy-checks">
          <li class="${progreso.porReservar ? 'hoy-check--alerta' : 'hoy-check--ok'}">
            ${icono(progreso.porReservar ? 'aviso' : 'check')}
            <a href="#/v/${viaje.id}/reservas">${progreso.porReservar
              ? `${plural(progreso.porReservar, 'reserva pendiente', 'reservas pendientes')}`
              : 'Nada pendiente de reservar'}</a>
          </li>
          ${listas.total ? html`
          <li class="${listas.hechas < listas.total ? 'hoy-check--alerta' : 'hoy-check--ok'}">
            ${icono(listas.hechas < listas.total ? 'lista' : 'check')}
            <a href="#/v/${viaje.id}/d/pre">Preparativos: ${listas.hechas} de ${listas.total} hechos</a>
          </li>` : ''}
          <li class="hoy-check--ok">${icono('itinerario')}
            <span>${plural(progreso.total, 'actividad planificada', 'actividades planificadas')}</span>
          </li>
        </ul>
      </section>

      ${primero ? html`
        <section class="hoy-siguiente">
          <p class="etiqueta">El primer día · ${fechaLarga(primero.fecha)}</p>
          <h2 class="titulo-2"><a href="#/v/${viaje.id}/d/${primero.fecha}">${primero.titulo}</a></h2>
          ${primera ? html`<p class="menudo">Empieza a las ${primera.inicio}${primera.lugar ? ` · ${primera.lugar.nombre}` : primera.titulo ? ` · ${primera.titulo}` : ''}</p>` : ''}
          <div class="hoy-acciones">
            <a class="boton boton--grande" href="#/v/${viaje.id}/d/${primero.fecha}">${icono('itinerario')}Ver el itinerario</a>
          </div>
        </section>` : ''}

      <p class="menudo hoy-pista">
        Durante el viaje, esta pantalla enseña lo que toca en cada momento: qué hay ahora,
        qué viene después y cómo se llega.
      </p>
    </div>`;
}

function pintarDespues(viaje, estado, { capa }) {
  const actividad = guardadoDe(estado, capa);
  const progreso = progresoDelViaje(viaje, actividad);
  return html`
    <div class="hoy">
      <header class="hoy__cabecera">
        <p class="etiqueta hoy__fecha">El viaje terminó el ${fechaLarga(viaje.fechas.fin)}</p>
        <h1 class="display" data-foco tabindex="-1">${viaje.titulo}</h1>
        <p class="secundario">${plural(viaje.dias.length, 'día')} · ${progreso.hechas} de ${progreso.total} actividades marcadas como hechas</p>
      </header>
      <section class="hoy-bloque">
        <div class="hoy-acciones">
          <a class="boton boton--grande" href="#/v/${viaje.id}/d/post">${icono('lista')}Al volver</a>
          <a class="boton boton--grande" href="#/perfil">${icono('descarga')}Guardar los recuerdos</a>
        </div>
        <p class="menudo" style="margin-top:var(--e3)">
          Lo visitado, las notas y las fotos viven en este navegador. Exportarlos es la única copia.
        </p>
      </section>
    </div>`;
}

/**
 * @param {object} viaje   El viaje montado.
 * @param {object} estado  El estado personal (`visitados`, `notas`, `tareas`).
 * @param {{capa:object, tiempo:object, ahora:Date}} opciones
 */
export function pintarHoy(viaje, estado, { capa = null, tiempo = null, ahora = new Date() } = {}) {
  const hoy = aIso(ahora);
  const dia = viaje.dias.find((d) => d.fecha === hoy);
  if (dia) return pintarHoyDelViaje(viaje, dia, estado, { capa, tiempo, ahora });
  if (hoy < viaje.fechas.inicio) return pintarAntes(viaje, estado, { capa, ahora });
  return pintarDespues(viaje, estado, { capa });
}

/** El día que enseña Hoy en el mapa: el de hoy, o el primero si todavía no ha empezado. */
export function diaDeHoy(viaje, ahora = new Date()) {
  const hoy = aIso(ahora);
  return viaje.dias.find((d) => d.fecha === hoy)
    || (hoy < viaje.fechas.inicio ? viaje.dias[0] : viaje.dias[viaje.dias.length - 1]);
}

