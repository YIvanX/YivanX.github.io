/**
 * Contenido del panel: cronología del día, ficha de lugar, transporte, listas
 * e información del viaje.
 *
 * Cada función devuelve HTML. El montaje y los eventos van en viaje.js, para
 * que aquí solo haya decisiones de qué se enseña y en qué orden.
 */

import { html, esc, icono, md, crudo, duracionTexto, duracionCorta, dinero } from '../ui/dom.js';
import { CATEGORIAS, MODOS, INTENSIDADES, NIVELES } from '../datos.js';
import { claveVisto } from '../estado.js';
import { rutaDelDia, enlaceLugar, enlaceComoLlegar, enlaceTramo } from '../enlaces-mapa.js';
import {
  fechaLarga, textoHorario, revisarBloque, estadoEn, aMinutos, aHora, aIso, claveDia, NOMBRE_DIA,
} from '../horarios.js';

const minutosAhora = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

/**
 * Separador de miles a la española. A mano y no con `toLocaleString`, porque
 * este depende de los datos de ICU que traiga el navegador y en algunas
 * compilaciones devuelve el número pelado: «6717» en vez de «6.717».
 */
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// --- Distintivos de un bloque --------------------------------------------

function chipsDeBloque(bloque, dia, moneda) {
  const lugar = bloque.lugar;
  const chips = [];

  // El nivel va primero a propósito: es lo que decide si te lo saltas cuando el
  // día se ha torcido y son las siete de la tarde.
  if (bloque.propio) chips.push(html`<span class="chip chip--propio">${icono('mas')}Añadida por ti</span>`);

  const nivel = NIVELES[lugar.nivel];
  if (nivel) chips.push(html`<span class="chip ${nivel.clase}">${nivel.etiqueta}</span>`);

  const cat = CATEGORIAS[lugar.categoria] || CATEGORIAS.practico;
  chips.push(html`<span class="chip chip--${lugar.categoria}">${icono(cat.icono)}${cat.etiqueta}</span>`);

  if (bloque.opcional) chips.push(html`<span class="chip chip--saltable">Se puede saltar</span>`);

  if (bloque.exterior) {
    chips.push(html`<span class="chip">Por fuera</span>`);
  } else {
    const revision = revisarBloque(lugar, dia.fecha, bloque);
    if (revision.nivel === 'error') {
      chips.push(html`<span class="chip chip--error">${icono('aviso')}${revision.mensaje}</span>`);
    } else if (revision.nivel === 'aviso') {
      chips.push(html`<span class="chip chip--alerta">${icono('reloj')}Cierra antes de acabar</span>`);
    } else if (lugar.horarios) {
      chips.push(html`<span class="chip chip--ok">Abierto</span>`);
    }
  }

  if (lugar.precio) {
    chips.push(html`<span class="chip">${icono('euro')}${dinero(lugar.precio.importe, moneda)}</span>`);
  }
  if (lugar.reserva?.necesaria) {
    chips.push(html`<span class="chip chip--alerta">${icono('candado')}Reservar</span>`);
  }
  return chips;
}

// --- Cronología -----------------------------------------------------------

function pintarBloqueVisita(bloque, dia, viaje, estado) {
  const lugar = bloque.lugar;
  const visitado = Boolean(estado.visitados[lugar.id]);
  const conNota = Boolean(estado.notas[lugar.id]);

  return html`
    <div class="bloque bloque--visita ${lugar.imagen ? 'bloque--con-foto' : ''} ${bloque.opcional ? 'bloque--opcional' : ''}"
         data-clave="${bloque.clave}" data-lugar="${lugar.id}"
         data-visitado="${String(visitado)}">
      <button type="button" class="bloque__principal">
      <span class="bloque__tiempo">
        ${bloque.inicio ? crudo(`<span class="bloque__hora">${esc(bloque.inicio)}</span>`) : ''}
        ${lugar.duracionMin ? crudo(`<span class="bloque__dur" style="display:block">${esc(duracionCorta(lugar.duracionMin))}</span>`) : ''}
      </span>
      <span class="bloque__rail"><span class="bloque__punto"></span></span>
      <span class="bloque__cuerpo">
        <span class="bloque__titulo">
          <span class="bloque__orden">${bloque.orden}</span>
          <span class="titulo-3">${lugar.nombre}</span>
          ${visitado ? icono('check', 'bloque__hecho') : ''}
        </span>
        <span class="bloque__resumen secundario" style="display:block">${lugar.resumen}</span>
        <span class="bloque__chips">${chipsDeBloque(bloque, dia, viaje.moneda)}</span>
        ${bloque.nota ? crudo(`<span class="bloque__nota" style="display:block">${esc(bloque.nota)}</span>`) : ''}
        ${conNota ? crudo(`<span class="bloque__nota" style="display:block">${esc(estado.notas[lugar.id])}</span>`) : ''}
      </span>
      </button>
      ${lugar.imagen ? crudo(`<img class="bloque__foto" src="${esc(lugar.imagen.archivo)}" alt=""
           loading="lazy" decoding="async" width="60" height="60"
           title="${esc(lugar.imagen.credito)}${lugar.imagen.licencia ? ' · ' + esc(lugar.imagen.licencia) : ''}">`) : ''}
      <a class="bloque__mapa" href="${enlaceLugar(lugar)}" target="_blank" rel="noopener noreferrer"
         aria-label="Ver ${lugar.nombre} en Google Maps" title="Ver en Google Maps">${icono('pin')}</a>
    </div>`;
}

function pintarBloqueTraslado(bloque) {
  const modo = MODOS[bloque.modo] || { etiqueta: 'Traslado', icono: 'adelante' };
  const minutos = (aMinutos(bloque.fin) - aMinutos(bloque.inicio)) || 0;
  const destino = bloque.lugarHasta?.nombre;
  const tramo = enlaceTramo(bloque.lugarDesde, bloque.lugarHasta, bloque.modo);

  return html`
    <div class="bloque bloque--traslado">
      <span class="bloque__tiempo">
        ${minutos > 0 ? crudo(`<span class="bloque__dur">${esc(duracionCorta(minutos))}</span>`) : ''}
      </span>
      <span class="bloque__rail"></span>
      <span class="bloque__cuerpo">
        <span class="bloque__linea">${icono(modo.icono)}<b>${modo.etiqueta}</b>${destino ? crudo(` &rarr; ${esc(destino)}`) : ''}${bloque.opcional ? crudo('<span class="chip chip--saltable">Se puede saltar</span>') : ''}</span>
        ${bloque.detalle ? crudo(`<span class="menudo" style="display:block;margin-top:2px">${esc(bloque.detalle)}</span>`) : ''}
      </span>
      ${tramo ? crudo(`<a class="bloque__mapa bloque__mapa--tramo" href="${esc(tramo)}"
           target="_blank" rel="noopener noreferrer"
           aria-label="Cómo ir de ${esc(bloque.lugarDesde.nombre)} a ${esc(bloque.lugarHasta.nombre)} en Google Maps"
           title="Cómo ir de ${esc(bloque.lugarDesde.nombre)} a ${esc(bloque.lugarHasta.nombre)}">
           <svg aria-hidden="true"><use href="#i-adelante"/></svg></a>`) : ''}
    </div>`;
}

function pintarBloqueHito(bloque) {
  return html`
    <div class="bloque bloque--hito">
      <span class="bloque__tiempo">
        ${bloque.inicio ? crudo(`<span class="bloque__hora">${esc(bloque.inicio)}</span>`) : ''}
      </span>
      <span class="bloque__rail"><span class="bloque__punto"></span></span>
      <span class="bloque__cuerpo">
        <span class="titulo-3">${bloque.titulo}</span>
        ${bloque.detalle ? crudo(`<span class="menudo" style="display:block;margin-top:2px">${esc(bloque.detalle)}</span>`) : ''}
      </span>
    </div>`;
}

/**
 * El día entero en Google Maps, con las paradas en orden.
 *
 * Se avisa cuando sale en modo coche y no lo es: Google no admite paradas
 * intermedias en transporte público, así que un día de tren cae a `driving`.
 * Decirlo evita que alguien lo siga creyendo que son las indicaciones reales.
 */
function enlaceRuta(dia) {
  const ruta = rutaDelDia(dia);
  if (!ruta) return '';

  const hayPublico = dia.bloques.some((b) => b.tipo === 'traslado' && (b.modo === 'tren' || b.modo === 'bus'));
  const aclaracion = ruta.modo === 'driving' && hayPublico
    ? 'Google no admite paradas intermedias en transporte público, así que la ruta sale en coche. Sirve para ver el día sobre el mapa, no para seguirla conduciendo.'
    : '';

  return html`
    <div class="dia-cabecera__ruta">
      <a class="boton boton--bloque" href="${ruta.url}" target="_blank" rel="noopener noreferrer">
        ${icono('mapa')}Ver el día en Google Maps
        <span class="menudo" style="margin-left:auto">${ruta.paradas} paradas</span>
      </a>
      ${aclaracion ? crudo(`<p class="menudo" style="margin-top:6px">${esc(aclaracion)}</p>`) : ''}
    </div>`;
}

const lineaAhora = () => html`
  <div class="ahora" aria-label="Ahora">
    <span class="ahora__hora">${aHora(minutosAhora())}</span>
    <span class="ahora__marca"></span>
    <span class="ahora__linea"></span>
  </div>`;

export function pintarDia(viaje, dia, estado, { ocultos = 0 } = {}) {
  const intensidad = INTENSIDADES[dia.intensidad] || INTENSIDADES.suave;
  const esHoy = dia.fecha === aIso(new Date());
  const ahora = minutosAhora();
  let puestaLaLinea = false;

  const cuerpo = dia.bloques.map((bloque) => {
    let antes = '';
    // La línea de «ahora» solo se pinta si hoy es este día. Justo antes del
    // primer bloque que todavía no ha empezado.
    if (esHoy && !puestaLaLinea && aMinutos(bloque.inicio) > ahora) {
      antes = lineaAhora();
      puestaLaLinea = true;
    }
    if (bloque.tipo === 'traslado') return antes + pintarBloqueTraslado(bloque);
    if (bloque.tipo === 'hito') return antes + pintarBloqueHito(bloque);
    if (!bloque.lugar) return antes;
    return antes + pintarBloqueVisita(bloque, dia, viaje, estado);
  }).join('');

  const cola = esHoy && !puestaLaLinea ? lineaAhora() : '';

  return html`
    <div class="dia-cabecera">
      <div class="dia-cabecera__meta">
        <span class="chip ${intensidad.clase}">${intensidad.etiqueta}</span>
        ${dia.totalParadas ? crudo(`<span class="chip">${dia.totalParadas} parada${dia.totalParadas === 1 ? '' : 's'}</span>`) : ''}
        ${esHoy ? crudo('<span class="chip chip--ok">Hoy</span>') : ''}
      </div>
      <h2 class="titulo-1" data-foco tabindex="-1">${dia.titulo}</h2>
      <p class="menudo" style="margin-top:4px">${fechaLarga(dia.fecha)}</p>
      ${dia.resumen ? crudo(`<p class="dia-cabecera__resumen secundario">${esc(dia.resumen)}</p>`) : ''}
      ${enlaceRuta(dia)}
      <div class="dia-cabecera__editar">
        <button type="button" class="boton" data-accion="anadir-parada">${icono('mas')}Añadir una parada</button>
        ${ocultos ? crudo(`<button type="button" class="boton boton--fantasma" data-accion="restaurar">
          ${esc(ocultos)} quitada${ocultos === 1 ? '' : 's'} · restaurar</button>`) : ''}
      </div>
    </div>
    ${dia.bloques.length
      ? crudo(`<div class="cronologia">${cuerpo}${cola}</div>`)
      : crudo('<div class="vacio"><svg aria-hidden="true"><use href="#i-reloj"/></svg><p class="secundario">Este día no tiene nada planificado todavía.</p></div>')}
  `;
}

// --- Ficha de lugar -------------------------------------------------------

export function pintarFicha(viaje, lugar, estado, { fecha, bloqueActual = null } = {}) {
  const cat = CATEGORIAS[lugar.categoria] || CATEGORIAS.practico;
  const visitado = Boolean(estado.visitados[lugar.id]);
  const dia = fecha || aIso(new Date());
  const situacion = estadoEn(lugar, dia, minutosAhora());

  const filas = [];
  if (lugar.horarios) {
    const hoyMismo = dia === aIso(new Date());
    filas.push([
      hoyMismo ? 'Hoy' : NOMBRE_DIA[claveDia(dia)],
      html`${textoHorario(lugar, dia)}
        ${hoyMismo && situacion.estado === 'abierto' ? crudo(' <span class="chip chip--ok">Abierto ahora</span>') : ''}
        ${hoyMismo && situacion.estado === 'cerrado-hoy' ? crudo(' <span class="chip chip--error">Cerrado hoy</span>') : ''}`,
    ]);
  }
  if (lugar.precio) filas.push(['Precio', html`${dinero(lugar.precio.importe, viaje.moneda)}${lugar.precio.detalle ? crudo(`<span class="menudo" style="display:block">${esc(lugar.precio.detalle)}</span>`) : ''}`]);
  if (lugar.duracionMin) filas.push(['Duración', duracionTexto(lugar.duracionMin)]);
  if (lugar.valoracion) {
    const v = lugar.valoracion;
    const cifras = [
      v.nota !== undefined ? `${String(v.nota).replace('.', ',')} / 5` : null,
      v.resenas !== undefined ? `${miles(v.resenas)} reseñas` : null,
    ].filter(Boolean).join(' · ');
    filas.push(['Valoración', html`<b>${cifras}</b>
      ${v.puesto ? crudo(`<span class="menudo" style="display:block">${esc(v.puesto)}</span>`) : ''}
      <span class="menudo" style="display:block">${esc(v.fuente)}</span>`]);
  }
  if (lugar.zona) filas.push(['Zona', lugar.zona]);
  if (lugar.reserva?.necesaria) filas.push(['Reserva', html`<b>Hace falta.</b> ${lugar.reserva.nota || ''}`]);
  if (lugar.verificado) filas.push(['Verificado', html`${lugar.verificado.fecha} · <span class="menudo">${lugar.verificado.fuente}</span>`]);

  return html`
    <div class="ficha__cabecera">
      <button type="button" class="icono-boton" data-accion="atras" aria-label="Volver">${icono('atras')}</button>
      <h2 class="titulo-3 ficha__nombre" data-foco tabindex="-1">${lugar.nombre}</h2>
      <button type="button" class="icono-boton" data-accion="centrar" style="margin-left:auto" aria-label="Centrar en el mapa">${icono('pin')}</button>
    </div>
    ${lugar.imagen ? crudo(`
      <figure class="ficha__foto">
        <img src="${esc(lugar.imagen.archivo)}" alt="${esc(lugar.nombre)}" loading="lazy" decoding="async">
        <figcaption class="menudo">
          ${esc(lugar.imagen.credito)}${lugar.imagen.licencia ? ` · ${esc(lugar.imagen.licencia)}` : ''}
          ${lugar.imagen.fuente ? `· <a href="${esc(lugar.imagen.fuente)}" target="_blank" rel="noopener noreferrer">Commons</a>` : ''}
        </figcaption>
      </figure>`) : ''}
    <div class="ficha__cuerpo">
      <div class="ficha__meta">
        ${NIVELES[lugar.nivel] ? crudo(`<span class="chip ${NIVELES[lugar.nivel].clase}">${esc(NIVELES[lugar.nivel].etiqueta)}</span>`) : ''}
        <span class="chip chip--${lugar.categoria}">${icono(cat.icono)}${cat.etiqueta}</span>
        ${visitado ? crudo('<span class="chip chip--ok">Visitado</span>') : ''}
      </div>

      <p class="ficha__resumen">${lugar.resumen}</p>

      ${lugar.descripcion ? crudo(`<div class="prosa">${md(lugar.descripcion)}</div>`) : ''}

      ${lugar.queMirar?.length ? crudo(`
        <section class="mirar">
          <div class="mirar__cabecera">
            <h3 class="etiqueta">Qué mirar</h3>
            <span class="menudo" data-cuenta-mirar>${lugar.queMirar.filter((q) => estado.vistos?.[claveVisto(lugar.id, q.que)]).length}/${lugar.queMirar.length}</span>
          </div>
          <p class="menudo">Ve marcándolo estando allí.</p>
          <div class="mirar__lista">
            ${lugar.queMirar.map((q) => {
              const clave = claveVisto(lugar.id, q.que);
              const hecho = Boolean(estado.vistos?.[clave]);
              return `
              <button type="button" class="mirar__item" role="checkbox"
                      aria-checked="${String(hecho)}" data-visto="${esc(clave)}">
                <span class="marca"><svg aria-hidden="true"><use href="#i-check"/></svg></span>
                <span>
                  <span class="mirar__que">${esc(q.que)}</span>
                  ${q.porque ? `<span class="mirar__porque">${esc(q.porque)}</span>` : ''}
                </span>
              </button>`;
            }).join('')}
          </div>
        </section>`) : ''}

      ${lugar.curiosidades?.length ? crudo(`
        <section class="curiosidades">
          <h3 class="etiqueta">Para contarlo luego</h3>
          ${lugar.curiosidades.map((cu) => `
            <article class="curiosidad">
              <h4 class="curiosidad__titulo">${esc(cu.titulo)}</h4>
              <p class="curiosidad__texto">${esc(cu.texto)}</p>
            </article>`).join('')}
        </section>`) : ''}

      ${filas.length ? crudo(`<div class="datos">${filas.map(([k, v]) => `
        <div class="datos__fila"><div class="datos__clave">${esc(k)}</div><div class="datos__valor">${v}</div></div>`).join('')}</div>`) : ''}

      ${lugar.consejos?.length ? crudo(`<div class="consejos">${lugar.consejos.map((c) => `
        <div class="consejo"><svg aria-hidden="true"><use href="#i-consejo"/></svg><span>${esc(c)}</span></div>`).join('')}</div>`) : ''}

      <div class="acciones-lugar">
        <button type="button" class="boton ${visitado ? '' : 'boton--principal'}" data-accion="visitado" aria-pressed="${String(visitado)}">
          ${icono('check')}${visitado ? 'Visitado' : 'Marcar visitado'}
        </button>
        <a class="boton" href="${enlaceLugar(lugar)}"
           target="_blank" rel="noopener noreferrer">${icono('pin')}Ver en Google Maps</a>
        <a class="boton" href="${enlaceComoLlegar(lugar)}"
           target="_blank" rel="noopener noreferrer">${icono('adelante')}Cómo llegar</a>
        ${lugar.enlaces?.map((e) => html`<a class="boton" href="${e.url}" target="_blank" rel="noopener noreferrer">${icono('enlace')}${e.texto}</a>`)}
      </div>

      ${bloqueActual ? crudo(`
        <div class="acciones-lugar" style="margin-top:var(--e3)">
          <button type="button" class="boton boton--peligro" data-accion="quitar-parada" data-clave="${esc(bloqueActual.clave)}">
            <svg aria-hidden="true"><use href="#i-papelera"/></svg>
            ${bloqueActual.propio ? 'Borrar esta parada' : 'Quitar de este día'}
          </button>
          <span class="menudo" style="align-self:center">
            ${bloqueActual.propio ? 'La añadiste tú: se borra del todo.' : 'Se oculta, no se borra. Se puede restaurar.'}
          </span>
        </div>`) : ''}

      <div style="margin-top:var(--e6)">
        <h3 class="etiqueta" style="color:var(--tinta-suave)">Tu nota</h3>
        <textarea class="nota-campo" data-campo="nota" placeholder="Qué te ha parecido, qué comisteis, qué te llevas…">${estado.notas[lugar.id] || ''}</textarea>
        <p class="menudo" style="margin-top:6px">Se guarda solo en este navegador. No se sube a ninguna parte.</p>
      </div>

      <div style="margin-top:var(--e6)">
        <h3 class="etiqueta" style="color:var(--tinta-suave)">Fotos</h3>
        <div class="galeria" data-galeria>
          <label class="anadir-foto" tabindex="0">
            ${icono('camara')}
            <input type="file" accept="image/*" multiple class="solo-lectores" data-campo="foto">
            <span class="solo-lectores">Añadir foto</span>
          </label>
        </div>
      </div>

      ${lugar.fotos?.length ? crudo(`<div class="galeria" style="margin-top:var(--e2)">${lugar.fotos.map((f) => `
        <div class="galeria__hueco"><img src="${esc(f.archivo)}" alt="${esc(f.pie || lugar.nombre)}" loading="lazy"></div>`).join('')}</div>`) : ''}
    </div>`;
}

// --- Transporte -----------------------------------------------------------

export function pintarTransporte(viaje) {
  if (!viaje.transporte?.length) {
    return html`<div class="vacio"><p class="secundario">Este viaje no tiene transporte declarado.</p></div>`;
  }
  return html`
    <div class="panel__seccion">
      <h2 class="titulo-2" data-foco tabindex="-1">Transporte</h2>
      <p class="secundario" style="margin-top:4px">Cada tramo, con su duración, su frecuencia y el descuento que aplica.</p>
      <div style="margin-top:var(--e3)">
        ${viaje.transporte.map((t) => {
          const modo = MODOS[t.modo] || { etiqueta: t.modo, icono: 'adelante' };
          return html`
            <div class="tramo">
              <div class="tramo__cabecera">${icono(modo.icono)}<span class="titulo-3">${t.tramo}</span></div>
              <div class="tramo__datos">
                ${t.servicio ? crudo(`<span class="tramo__dato">${esc(t.servicio)}</span>`) : ''}
                ${t.duracion ? crudo(`<span class="tramo__dato"><b>${esc(t.duracion)}</b></span>`) : ''}
                ${t.frecuencia ? crudo(`<span class="tramo__dato">${esc(t.frecuencia)}</span>`) : ''}
                ${t.precio ? crudo(`<span class="tramo__dato"><b>${esc(t.precio)}</b></span>`) : ''}
              </div>
              ${t.descuento && t.descuento !== '—' ? crudo(`<div class="tramo__datos"><span class="chip chip--ok">${esc(t.descuento)}</span></div>`) : ''}
              ${t.nota ? crudo(`<p class="tramo__nota">${esc(t.nota)}</p>`) : ''}
            </div>`;
        })}
      </div>
    </div>`;
}

// --- Listas ---------------------------------------------------------------

export function pintarListas(viaje, estado) {
  if (!viaje.listas?.length) {
    return html`<div class="vacio"><p class="secundario">Este viaje no tiene listas.</p></div>`;
  }
  return viaje.listas.map((lista, i) => {
    const hechas = lista.items.filter((i) => estado.tareas[i.id]).length;
    const pct = lista.items.length ? Math.round((hechas / lista.items.length) * 100) : 0;
    return html`
      <div class="panel__seccion">
        <h2 class="titulo-2" ${i === 0 ? 'data-foco tabindex="-1"' : ''}>${lista.titulo}</h2>
        <div class="progreso-lista">
          <span class="progreso-lista__pista"><span class="progreso-lista__valor" style="width:${pct}%"></span></span>
          <span class="menudo">${hechas}/${lista.items.length}</span>
        </div>
        <div style="margin-top:var(--e3)">
          ${lista.items.map((item) => html`
            <button type="button" class="tarea" role="checkbox"
                    aria-checked="${String(Boolean(estado.tareas[item.id]))}" data-tarea="${item.id}">
              <span class="marca">${icono('check')}</span>
              <span>
                <span class="tarea__texto" style="display:block">${item.texto}</span>
                ${item.detalle ? crudo(`<span class="tarea__detalle" style="display:block">${esc(item.detalle)}</span>`) : ''}
              </span>
            </button>`)}
        </div>
      </div>`;
  }).join('');
}

// --- Información del viaje ------------------------------------------------

export function pintarInfo(viaje, { privados = { campos: [] }, capa = null } = {}) {
  const niveles = { alto: 'aviso--alto', medio: 'aviso--medio', info: 'aviso--info' };

  return html`
    <div class="panel__seccion">
      <h2 class="titulo-2" data-foco tabindex="-1">${viaje.titulo}</h2>
      ${viaje.subtitulo ? crudo(`<p class="secundario" style="margin-top:2px">${esc(viaje.subtitulo)}</p>`) : ''}
      ${viaje.resumen ? crudo(`<p class="cuerpo" style="margin-top:var(--e3)">${esc(viaje.resumen)}</p>`) : ''}
      <div class="ficha__meta" style="margin-top:var(--e4)">
        ${viaje.base ? crudo(`<span class="chip">${esc(viaje.base)}</span>`) : ''}
        ${viaje.viajeros?.length ? crudo(`<span class="chip">${esc(viaje.viajeros.join(' y '))}</span>`) : ''}
        <span class="chip">${viaje.dias.length} días</span>
      </div>
    </div>

    ${viaje.avisos?.length ? crudo(`
      <div class="panel__seccion">
        <h2 class="titulo-2" style="margin-bottom:var(--e3)">Lo que puede romper el viaje</h2>
        ${viaje.avisos.map((a) => `
          <div class="aviso ${niveles[a.nivel] || 'aviso--info'}">
            <svg aria-hidden="true"><use href="#i-aviso"/></svg>
            <div><div class="aviso__titulo">${esc(a.titulo)}</div><div class="aviso__texto">${esc(a.texto)}</div></div>
          </div>`).join('')}
      </div>`) : ''}

    ${viaje.presupuesto ? crudo(`
      <div class="panel__seccion">
        <h2 class="titulo-2">Presupuesto</h2>
        ${viaje.presupuesto.nota ? `<p class="menudo" style="margin-top:4px">${esc(viaje.presupuesto.nota)}</p>` : ''}
        <div style="margin-top:var(--e3)">
          ${(viaje.presupuesto.partidas || []).map((p) => `
            <div class="partida ${p.destacado ? 'partida--destacado' : ''}">
              <span>${esc(p.concepto)}</span><span class="partida__importe">${esc(p.importe)}</span>
            </div>`).join('')}
        </div>
      </div>`) : ''}

    <div class="panel__seccion">
      <h2 class="titulo-2">Datos privados</h2>
      <p class="menudo" style="margin-top:4px">
        Dirección del alojamiento, referencias de reserva, teléfonos. Se guardan
        <b>solo en este navegador</b> y nunca en el repositorio, que es público.
      </p>
      <div data-privados style="margin-top:var(--e3)">
        ${privados.campos.map((c, i) => html`
          <div class="datos__fila" style="border:1px solid var(--borde);border-radius:var(--r-m);margin-bottom:6px">
            <div class="datos__clave">${c.clave}</div>
            <div class="datos__valor" style="display:flex;gap:8px;align-items:start">
              <span style="flex:1">${c.valor}</span>
              <button type="button" class="icono-boton" data-quitar-privado="${i}" aria-label="Quitar">${icono('papelera')}</button>
            </div>
          </div>`)}
      </div>
      <button type="button" class="boton boton--bloque" data-accion="anadir-privado">${icono('mas')}Añadir un dato</button>
    </div>

    ${capa && (capa.lugares.length || capa.bloques.length || capa.ocultos.length) ? crudo(`
      <div class="panel__seccion">
        <h2 class="titulo-2">Tus cambios en el itinerario</h2>
        <p class="menudo" style="margin-top:4px">
          ${capa.lugares.length} parada(s) añadida(s) y ${capa.ocultos.length} quitada(s).
          Viven en este navegador; el archivo del viaje no se toca.
        </p>
        <div style="display:flex;gap:8px;margin-top:var(--e3);flex-wrap:wrap">
          <button type="button" class="boton" data-accion="copiar-capa">
            <svg aria-hidden="true"><use href="#i-nota"/></svg>Copiar como JSON del viaje
          </button>
          <button type="button" class="boton boton--peligro" data-accion="vaciar-capa">
            <svg aria-hidden="true"><use href="#i-papelera"/></svg>Deshacer todos
          </button>
        </div>
        <p class="menudo" style="margin-top:var(--e2)">
          «Copiar como JSON» deja los cambios listos para pegarlos en
          <code>data/viajes/${esc(viaje.id)}.json</code> y hacerlos permanentes.
        </p>
      </div>`) : ''}

    <div class="panel__seccion">
      <h2 class="titulo-2">Recuerdos</h2>
      <p class="menudo" style="margin-top:4px">
        Lo visitado, las notas y las fotos viven en este navegador. Si se limpia,
        se pierden: exporta un archivo para conservarlos.
      </p>
      <div style="display:flex;gap:8px;margin-top:var(--e3);flex-wrap:wrap">
        <button type="button" class="boton" data-accion="exportar">${icono('descarga')}Exportar</button>
        <label class="boton" tabindex="0">${icono('importar')}Importar
          <input type="file" accept="application/json" class="solo-lectores" data-campo="importar">
        </label>
      </div>
      <p class="menudo" data-ocupacion style="margin-top:var(--e2)"></p>
    </div>

    ${(() => {
      const conFoto = viaje.lugares.filter((l) => l.imagen);
      if (!conFoto.length) return '';
      // Las licencias CC exigen atribución. Va aquí entera, además de bajo cada foto.
      return crudo(`
        <div class="panel__seccion">
          <h2 class="titulo-2">Créditos de las fotos</h2>
          <p class="menudo" style="margin-top:4px">
            Imágenes de Wikimedia Commons con licencia libre, guardadas en el repositorio
            para que se vean sin conexión. Cada una con su autor y su licencia.
          </p>
          <div style="margin-top:var(--e3)">
            ${conFoto.map((l) => `
              <div class="credito-foto">
                <img src="${esc(l.imagen.archivo)}" alt="" loading="lazy" decoding="async">
                <div>
                  <div class="titulo-3">${esc(l.nombre)}</div>
                  <div class="menudo">
                    ${esc(l.imagen.credito)}${l.imagen.licencia ? ` · ${esc(l.imagen.licencia)}` : ''}
                    ${l.imagen.fuente ? `· <a href="${esc(l.imagen.fuente)}" target="_blank" rel="noopener noreferrer">Commons</a>` : ''}
                  </div>
                </div>
              </div>`).join('')}
          </div>
        </div>`);
    })()}

    ${viaje.fuentes?.length ? crudo(`
      <div class="panel__seccion">
        <h2 class="titulo-2">Fuentes</h2>
        <p class="menudo" style="margin-top:4px">De dónde salen los horarios y los precios de esta guía.</p>
        <ul style="margin-top:var(--e3);display:grid;gap:8px">
          ${viaje.fuentes.map((f) => `<li><a class="secundario" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.texto)}</a></li>`).join('')}
        </ul>
      </div>`) : ''}
  `;
}
