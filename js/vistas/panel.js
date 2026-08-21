/**
 * Contenido del panel, por niveles: portada del viaje, un día del itinerario,
 * ficha de un lugar, preparativos, vuelta, transporte y listas.
 *
 * Cada función devuelve HTML. El montaje y los eventos van en viaje.js, para
 * que aquí solo haya decisiones de qué se enseña y en qué orden.
 *
 * **El orden dentro de un día no es estético.** En el móvil el panel es una hoja
 * que asoma 132 px sobre el mapa (`ui/hoja.js`), y eso es lo único que se ve
 * andando por la calle: por ahí van el título, la fecha y las bandas de hoy, y
 * los botones de editar bajan por debajo de ellas.
 */

import { html, esc, icono, md, crudo, plural, duracionTexto, duracionCorta, dinero } from '../ui/dom.js';
import { CATEGORIAS, MODOS, INTENSIDADES, NIVELES, ESTADOS_VIAJE } from '../datos.js';
import { claveVisto } from '../estado.js';
import { rutaDelDia, enlaceLugar, enlaceComoLlegar, enlaceTramo } from '../enlaces-mapa.js';
import {
  avisosDelDia, avisosDelViaje, avisosDeMomento, listasDe, progresoDeListas,
  tramosDelDia, tramosDelViaje, resumenDeTramos, hayPreViaje, hayPostViaje,
} from '../agenda.js';
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

/**
 * El icono de nube de una parada, si tiene estado. Con `title` y con texto para
 * lector de pantalla: un color por sí solo no es información accesible, y aquí
 * la diferencia entre los dos estados importa.
 */
function marcaDeNube(bloque) {
  if (bloque.nube === 'pendiente') {
    return crudo(`<span class="bloque__nube bloque__nube--pendiente" title="Sin subir a la nube">
      <svg aria-hidden="true" style="width:100%;height:100%"><use href="#i-nube-sube"/></svg>
      <span class="solo-lectores">Sin subir a la nube</span></span>`);
  }
  if (bloque.nube === 'en-nube') {
    return crudo(`<span class="bloque__nube bloque__nube--en-nube" title="Guardado en la nube">
      <svg aria-hidden="true" style="width:100%;height:100%"><use href="#i-nube"/></svg>
      <span class="solo-lectores">Guardado en la nube</span></span>`);
  }
  return '';
}

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
          ${marcaDeNube(bloque)}
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

/**
 * La barra de cambios sin guardar.
 *
 * Se pinta dentro del día y pegada arriba, no como aviso efímero, porque un
 * mensaje que se va no sirve para algo que sigue siendo verdad: mientras haya
 * cambios sin subir, tiene que verse.
 */
function barraPendientes(cuantos) {
  if (!cuantos) return '';
  return crudo(`
    <div class="pendientes" role="status">
      <svg aria-hidden="true"><use href="#i-nube-sube"/></svg>
      <span class="pendientes__texto"><b>${cuantos} cambio${cuantos === 1 ? '' : 's'} sin guardar</b> en la nube.
        Están a salvo en este dispositivo, pero nadie más los ve.</span>
      <button type="button" class="boton boton--principal" data-accion="guardar-nube">Guardar en la nube</button>
    </div>`);
}

// --- Piezas que se repiten en varios niveles ------------------------------
// Una sola marca para cada cosa, usada desde el día, la portada, los
// preparativos y la vuelta. Si hubiera una copia por sitio, un arreglo saldría
// bien en uno y mal en los otros tres sin que nadie se enterase.

const CLASE_AVISO = { alto: 'aviso--alto', medio: 'aviso--medio', info: 'aviso--info' };

function pintarAviso(a) {
  return html`
    <div class="aviso ${CLASE_AVISO[a.nivel] || 'aviso--info'}">
      ${icono('aviso')}
      <div><div class="aviso__titulo">${a.titulo}</div><div class="aviso__texto">${a.texto}</div></div>
    </div>`;
}

/**
 * Una lista marcable.
 *
 * `data-lista` es el ancla: el manejador de `[data-tarea]` de viaje.js sube por
 * ahí para repintar el progreso. Antes subía hasta `.panel__seccion`, que dentro
 * de una banda del día no existe — y ese `closest` habría devuelto `null` justo
 * al marcar la primera tarea desde el día.
 */
function pintarLista(lista, estado, { foco = false } = {}) {
  const hechas = lista.items.filter((i) => estado.tareas[i.id]).length;
  const pct = lista.items.length ? Math.round((hechas / lista.items.length) * 100) : 0;
  return html`
    <div data-lista>
      <h3 class="titulo-3" ${foco ? crudo('data-foco tabindex="-1"') : ''}>${lista.titulo}</h3>
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
}

/** Un tramo calculado del itinerario, con su enlace a Google Maps si lo tiene. */
function pintarTramo(t) {
  const modo = MODOS[t.modo] || { etiqueta: t.modo || 'Traslado', icono: 'adelante' };
  const url = t.desde && t.hasta ? enlaceTramo(t.desde, t.hasta, t.modo) : '';
  const ruta = [t.desde?.nombre, t.hasta?.nombre].filter(Boolean).join(' → ');
  return html`
    <div class="tramo">
      <div class="tramo__cabecera">
        ${icono(modo.icono)}
        <span class="titulo-3">${ruta || modo.etiqueta}</span>
        ${url ? crudo(`<a class="bloque__mapa bloque__mapa--tramo" style="position:static;margin-left:auto"
             href="${esc(url)}" target="_blank" rel="noopener noreferrer"
             aria-label="Cómo ir de ${esc(t.desde.nombre)} a ${esc(t.hasta.nombre)} en Google Maps"
             title="Cómo llegar"><svg aria-hidden="true"><use href="#i-adelante"/></svg></a>`) : ''}
      </div>
      <div class="tramo__datos">
        ${t.inicio ? crudo(`<span class="tramo__dato"><b>${esc(t.inicio)}${t.fin ? ' – ' + esc(t.fin) : ''}</b></span>`) : ''}
        <span class="tramo__dato">${modo.etiqueta}</span>
        ${t.minutos ? crudo(`<span class="tramo__dato">${esc(duracionTexto(t.minutos))}</span>`) : ''}
        ${t.opcional ? crudo('<span class="chip chip--saltable">Se puede saltar</span>') : ''}
      </div>
      ${t.detalle ? crudo(`<p class="tramo__nota">${esc(t.detalle)}</p>`) : ''}
    </div>`;
}

/**
 * Una banda plegable del día.
 *
 * `<details>` nativo a propósito: sin estado en JS, funciona con teclado y no
 * compite con la delegación de eventos que ya hay en el panel. **Todas nacen
 * cerradas**, incluso las de nivel alto: lo que asoma en el móvil son 132 px, y
 * una banda que se abre sola se los come. El resumen ya dice cuántas hay y de
 * qué color; el detalle está a un toque.
 */
function banda(nombre, { icono: nombreIcono, titulo, pista = '', clase = '', cuerpo }) {
  return html`
    <details class="banda ${clase}" data-banda="${nombre}">
      <summary class="banda__resumen">
        ${icono(nombreIcono, 'banda__icono')}
        <span class="banda__titulo">${titulo}</span>
        ${pista ? crudo(`<span class="banda__pista menudo">${esc(pista)}</span>`) : ''}
        ${icono('adelante', 'banda__flecha')}
      </summary>
      <div class="banda__cuerpo">${cuerpo}</div>
    </details>`;
}

/**
 * Lo que aplica a este día y no al viaje entero: sus avisos, sus traslados y su
 * lista. **Lo que no tiene contenido no se pinta**, así que un día pelado se ve
 * exactamente igual que antes de que estas bandas existieran.
 */
function bandasDelDia(viaje, dia, estado) {
  const avisos = avisosDelDia(viaje, dia.fecha);
  const tramos = tramosDelDia(dia);
  const listas = listasDe(viaje, dia.fecha);
  if (!avisos.length && !tramos.length && !listas.length) return '';

  const bandas = [];

  if (avisos.length) {
    const grave = avisos.some((a) => a.nivel === 'alto');
    bandas.push(banda('avisos', {
      icono: 'aviso',
      clase: grave ? 'banda--grave' : '',
      titulo: `${avisos.length} aviso${avisos.length === 1 ? '' : 's'} de este día`,
      cuerpo: html`${avisos.map(pintarAviso)}`,
    }));
  }

  if (tramos.length) {
    const r = resumenDeTramos(tramos);
    const modos = r.modos.map((m) => (MODOS[m] || { etiqueta: m }).etiqueta).join(' y ');
    bandas.push(banda('transporte', {
      icono: r.modos.length === 1 ? (MODOS[r.modos[0]]?.icono || 'transporte') : 'transporte',
      titulo: modos || 'Traslados',
      pista: [`${r.cuantos} tramo${r.cuantos === 1 ? '' : 's'}`, r.minutos ? duracionCorta(r.minutos) : '']
        .filter(Boolean).join(' · '),
      cuerpo: html`${tramos.map(pintarTramo)}`,
    }));
  }

  if (listas.length) {
    const { hechas, total } = progresoDeListas(listas, estado.tareas);
    bandas.push(banda('lista', {
      icono: 'lista',
      titulo: listas.length === 1 ? listas[0].titulo : 'Listas de este día',
      pista: `${hechas}/${total}`,
      cuerpo: html`${listas.map((l) => pintarLista(l, estado))}`,
    }));
  }

  return html`<div class="bandas">${bandas}</div>`;
}

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
    ${barraPendientes(viaje.pendientes)}
    <div class="dia-cabecera">
      <div class="dia-cabecera__meta">
        <span class="chip ${intensidad.clase}">${intensidad.etiqueta}</span>
        ${dia.totalParadas ? crudo(`<span class="chip">${dia.totalParadas} parada${dia.totalParadas === 1 ? '' : 's'}</span>`) : ''}
        ${esHoy ? crudo('<span class="chip chip--ok">Hoy</span>') : ''}
      </div>
      <h1 class="titulo-1" data-foco tabindex="-1">${dia.titulo}</h1>
      <p class="menudo" style="margin-top:4px">${fechaLarga(dia.fecha)}</p>
      ${dia.resumen ? crudo(`<p class="dia-cabecera__resumen secundario">${esc(dia.resumen)}</p>`) : ''}
      ${enlaceRuta(dia)}
      ${bandasDelDia(viaje, dia, estado)}
    </div>
    ${dia.bloques.length
      ? crudo(`<div class="cronologia">${cuerpo}${cola}</div>`)
      : crudo('<div class="vacio"><svg aria-hidden="true"><use href="#i-reloj"/></svg><p class="secundario">Este día no tiene nada planificado todavía.</p></div>')}
    <div class="dia-editar">
      <button type="button" class="boton" data-accion="anadir-parada">${icono('mas')}Añadir una parada</button>
      ${ocultos ? crudo(`<button type="button" class="boton boton--fantasma" data-accion="restaurar">
        ${esc(ocultos)} quitada${ocultos === 1 ? '' : 's'} · restaurar</button>`) : ''}
    </div>
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
      <h1 class="titulo-3 ficha__nombre" data-foco tabindex="-1">${lugar.nombre}</h1>
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

/** Los contratos y reservas escritos a mano en `transporte[]`. */
function pintarContratos(viaje, { foco = false } = {}) {
  if (!viaje.transporte?.length) return '';
  return html`
    <div class="panel__seccion">
      ${crudo(foco ? '<h1 class="titulo-2" data-foco tabindex="-1">Contratos y reservas</h1>'
                   : '<h2 class="titulo-2">Contratos y reservas</h2>')}
      <p class="menudo" style="margin-top:4px">
        Lo que se contrata o se reserva, con su servicio, su precio y su descuento.
        Los tramos concretos de cada día salen del itinerario.
      </p>
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

/**
 * Todo el transporte del viaje.
 *
 * Los tramos **se calculan** de los bloques de traslado de cada día, no se leen
 * de `transporte[]`. Escritos a mano en dos sitios acaban discrepando: en este
 * viaje ya pasó, con una entrada que decía «Ponferrada → León» cuando el bloque
 * real de ese día salía de Villafranca. Calculado, no puede desviarse.
 */
export function pintarTransporte(viaje) {
  const grupos = tramosDelViaje(viaje);
  if (!grupos.length && !viaje.transporte?.length) {
    return html`<div class="vacio"><p class="secundario">Este viaje no tiene transporte declarado.</p></div>`;
  }

  const total = grupos.reduce((s, g) => s + resumenDeTramos(g.tramos).minutos, 0);
  const cuantos = grupos.reduce((s, g) => s + g.tramos.length, 0);

  return html`
    ${grupos.length ? html`
      <div class="panel__seccion">
        <h1 class="titulo-2" data-foco tabindex="-1">Transporte</h1>
        <p class="secundario" style="margin-top:4px">
          ${cuantos} tramo${cuantos === 1 ? '' : 's'} en ${grupos.length} día${grupos.length === 1 ? '' : 's'}${total ? `, ${duracionTexto(total)} en total` : ''}.
          Salen del itinerario, así que no pueden decir algo distinto de él.
        </p>
        ${grupos.map((g) => html`
          <div class="tramos-dia">
            <a class="tramos-dia__cabecera" href="#/v/${viaje.id}/d/${g.dia.fecha}">
              <span class="etiqueta">${fechaLarga(g.dia.fecha)}</span>
              <span class="titulo-3">${g.dia.titulo || ''}</span>
              ${icono('adelante')}
            </a>
            ${g.tramos.map(pintarTramo)}
          </div>`)}
      </div>` : ''}
    ${pintarContratos(viaje, { foco: !grupos.length })}`;
}

// --- Listas ---------------------------------------------------------------

/**
 * Todas las listas del viaje, agrupadas por dónde viven.
 *
 * Una lista de un día concreto también sale aquí, con su fecha delante: esta es
 * la vista de «enséñamelo todo junto», y esconder algo en ella obligaría a
 * recorrer los seis días para encontrarlo.
 */
export function pintarListas(viaje, estado) {
  if (!viaje.listas?.length) {
    return html`<div class="vacio"><p class="secundario">Este viaje no tiene listas.</p></div>`;
  }

  const grupos = [
    { titulo: 'Antes de salir', listas: listasDe(viaje, 'pre') },
    { titulo: 'Del viaje', listas: listasDe(viaje, 'viaje') },
    ...viaje.dias
      .map((d) => ({ titulo: fechaLarga(d.fecha), listas: listasDe(viaje, d.fecha) }))
      .filter((g) => g.listas.length),
    { titulo: 'Al volver', listas: listasDe(viaje, 'post') },
  ].filter((g) => g.listas.length);

  const { hechas, total } = progresoDeListas(viaje.listas, estado.tareas);

  return html`
    <div class="panel__seccion">
      <h1 class="titulo-2" data-foco tabindex="-1">Listas</h1>
      <p class="secundario" style="margin-top:4px">${hechas} de ${total} marcadas.</p>
    </div>
    ${grupos.map((g) => html`
      <div class="panel__seccion">
        <h2 class="titulo-2">${g.titulo}</h2>
        ${g.listas.map((lista) => html`<div style="margin-top:var(--e4)">${pintarLista(lista, estado)}</div>`)}
      </div>`)}`;
}

// --- Preparativos y vuelta ------------------------------------------------

export function pintarPreparativos(viaje, estado) {
  const avisos = avisosDeMomento(viaje, 'pre');
  const listas = listasDe(viaje, 'pre');
  const { hechas, total } = progresoDeListas(listas, estado.tareas);

  return html`
    <div class="panel__seccion">
      <h1 class="titulo-2" data-foco tabindex="-1">Preparativos</h1>
      <p class="secundario" style="margin-top:4px">
        Lo que hay que dejar resuelto antes de salir${total ? `. Van ${hechas} de ${total}` : ''}.
      </p>
    </div>

    ${avisos.length ? html`
      <div class="panel__seccion">
        <h2 class="titulo-2" style="margin-bottom:var(--e3)">Resolver antes de salir</h2>
        ${avisos.map(pintarAviso)}
      </div>` : ''}

    ${listas.map((lista) => html`
      <div class="panel__seccion">${pintarLista(lista, estado)}</div>`)}

    ${pintarContratos(viaje)}

    ${!avisos.length && !listas.length && !viaje.transporte?.length ? html`
      <div class="vacio">
        ${icono('lista')}
        <p class="secundario">Todavía no hay nada marcado como preparativo.</p>
        <p class="menudo" style="margin-top:8px">
          Se marca poniendo <code>"momento": "pre"</code> en una lista o en un aviso del archivo del viaje.
        </p>
      </div>` : ''}`;
}

export function pintarAlVolver(viaje, estado) {
  const avisos = avisosDeMomento(viaje, 'post');
  const listas = listasDe(viaje, 'post');

  return html`
    <div class="panel__seccion">
      <h1 class="titulo-2" data-foco tabindex="-1">Al volver</h1>
      <p class="secundario" style="margin-top:4px">Lo que queda por hacer cuando el viaje ya ha terminado.</p>
    </div>

    ${avisos.length ? html`<div class="panel__seccion">${avisos.map(pintarAviso)}</div>` : ''}
    ${listas.map((lista) => html`<div class="panel__seccion">${pintarLista(lista, estado)}</div>`)}

    <div class="panel__seccion">
      <h2 class="titulo-2">Guardar los recuerdos</h2>
      <p class="menudo" style="margin-top:4px">
        Lo visitado, las notas y las fotos viven en este navegador. Si se limpia, se
        pierden, y el archivo exportado es la única copia.
      </p>
      <a class="boton boton--principal boton--bloque" href="#/perfil" style="margin-top:var(--e3)">
        ${icono('descarga')}Exportar desde Tus datos
      </a>
    </div>`;
}


// --- Portada del viaje ----------------------------------------------------

/**
 * De dónde ha salido el viaje que estás viendo.
 *
 * Se enseña en el panel y no solo como aviso al abrir, porque es la clase de
 * dato que se quiere **poder consultar** y no solo ver pasar: «¿esto que tengo
 * delante es lo mismo que ve la otra persona?» no se responde con un mensaje que
 * ya se fue.
 */
const ORIGEN = {
  nube: (v) => `<b>De la nube</b> · versión ${Number(v) || '?'}`,
  'sin-fila': () => 'Solo en este dispositivo — todavía no está en la nube',
  fallo: () => '<b>Del repositorio</b> — la nube no contestó, así que puede estar vieja',
  'sin-nube': () => 'Del repositorio',
};

/** Una fila de la lista de días de la portada. */
function filaDeDia(viaje, dia, { hoy, atencion }) {
  const intensidad = INTENSIDADES[dia.intensidad] || INTENSIDADES.suave;
  return html`
    <a class="fila-dia ${dia.fecha === hoy ? 'fila-dia--hoy' : ''}" href="#/v/${viaje.id}/d/${dia.fecha}">
      <span class="fila-dia__fecha">
        <span class="fila-dia__dia">${NOMBRE_DIA[claveDia(dia.fecha)].slice(0, 3)}</span>
        <span class="fila-dia__num">${Number(dia.fecha.slice(8, 10))}</span>
      </span>
      <span class="fila-dia__cuerpo">
        <span class="fila-dia__titulo">
          <span class="titulo-3">${dia.titulo}</span>
          ${atencion ? crudo('<span class="fila-dia__punto" title="Tiene avisos o lista sin terminar"></span>') : ''}
        </span>
        <span class="fila-dia__meta menudo">
          ${dia.fecha === hoy ? crudo('<b>Hoy</b> · ') : ''}${intensidad.etiqueta}${dia.totalParadas ? ` · ${dia.totalParadas} parada${dia.totalParadas === 1 ? '' : 's'}` : ''}
        </span>
      </span>
      ${icono('adelante', 'fila-dia__flecha')}
    </a>`;
}

/** Una fila de acceso a algo que no es un día: preparativos, transporte, listas. */
function filaDeSeccion({ url, nombreIcono, titulo, pista = '' }) {
  return html`
    <a class="fila-dia fila-dia--seccion" href="${url}">
      <span class="fila-dia__fecha">${icono(nombreIcono)}</span>
      <span class="fila-dia__cuerpo">
        <span class="fila-dia__titulo"><span class="titulo-3">${titulo}</span></span>
        ${pista ? crudo(`<span class="fila-dia__meta menudo">${esc(pista)}</span>`) : ''}
      </span>
      ${icono('adelante', 'fila-dia__flecha')}
    </a>`;
}

/**
 * La portada del viaje: el nivel del que cuelga todo lo demás.
 *
 * Lo que **no** está aquí es la cuenta —correo, sesión, id, almacenamiento—,
 * que se ha ido a `#/perfil`. El corte es el motivo de todo el cambio: «¿he
 * iniciado sesión?» es una pregunta sobre ti y «¿está este viaje sincronizado?»
 * es una pregunta sobre el viaje. Compartiendo caja, ninguna de las dos se leía.
 */
export function pintarPortada(viaje, {
  capa = null, nube = null, tareas = {}, atencion = () => false,
} = {}) {
  const hoy = aIso(new Date());
  const estadoViaje = ESTADOS_VIAJE[viaje.estadoReal] || ESTADOS_VIAJE.planificado;
  const avisos = avisosDelViaje(viaje);
  const tramos = tramosDelViaje(viaje).reduce((s, g) => s + g.tramos.length, 0);
  const listas = progresoDeListas(viaje.listas || [], tareas);

  return html`
    <div class="panel__seccion">
      <div class="ficha__meta" style="margin:0 0 var(--e3)">
        <span class="chip ${estadoViaje.clase}">${estadoViaje.etiqueta}</span>
        ${viaje.base ? crudo(`<span class="chip">${esc(viaje.base)}</span>`) : ''}
        ${viaje.viajeros?.length ? crudo(`<span class="chip">${esc(viaje.viajeros.join(' y '))}</span>`) : ''}
      </div>
      <h1 class="display" data-foco tabindex="-1">${viaje.titulo}</h1>
      ${viaje.subtitulo ? crudo(`<p class="secundario" style="margin-top:var(--e2)">${esc(viaje.subtitulo)}</p>`) : ''}
      <p class="menudo" style="margin-top:var(--e3)">
        ${fechaLarga(viaje.fechas.inicio)} – ${fechaLarga(viaje.fechas.fin)} · ${viaje.dias.length} días
      </p>
      ${viaje.resumen ? crudo(`<p class="cuerpo" style="margin-top:var(--e4)">${esc(viaje.resumen)}</p>`) : ''}
    </div>

    <div class="panel__seccion">
      <h2 class="titulo-2">El itinerario</h2>
      <div class="pulso-dias" aria-hidden="true">
        ${viaje.dias.map((d) => crudo(`<i data-i="${esc(d.intensidad || 'suave')}"></i>`))}
      </div>
      <div style="margin-top:var(--e4)">
        ${hayPreViaje(viaje) ? filaDeSeccion({
          url: `#/v/${viaje.id}/d/pre`,
          nombreIcono: 'lista',
          titulo: 'Preparativos',
          pista: 'Antes de salir',
        }) : ''}
        ${viaje.dias.map((d) => filaDeDia(viaje, d, { hoy, atencion: atencion(d.fecha) }))}
        ${hayPostViaje(viaje) ? filaDeSeccion({
          url: `#/v/${viaje.id}/d/post`,
          nombreIcono: 'descarga',
          titulo: 'Al volver',
          pista: 'Cuando el viaje termine',
        }) : ''}
      </div>
    </div>

    <div class="panel__seccion">
      <h2 class="titulo-2">Del viaje entero</h2>
      <div style="margin-top:var(--e3)">
        ${filaDeSeccion({
          url: `#/v/${viaje.id}/transporte`,
          nombreIcono: 'transporte',
          titulo: 'Transporte',
          pista: tramos ? `${tramos} tramos, calculados del itinerario` : 'Contratos y reservas',
        })}
        ${viaje.listas?.length ? filaDeSeccion({
          url: `#/v/${viaje.id}/listas`,
          nombreIcono: 'lista',
          titulo: 'Listas',
          pista: `${listas.hechas}/${listas.total} marcadas`,
        }) : ''}
      </div>
    </div>

    ${avisos.length ? html`
      <div class="panel__seccion">
        <h2 class="titulo-2" style="margin-bottom:var(--e3)">Lo que puede romper el viaje</h2>
        <p class="menudo" style="margin:-6px 0 var(--e3)">
          Los que son de un día concreto salen dentro de ese día, no aquí.
        </p>
        ${avisos.map(pintarAviso)}
      </div>` : ''}

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

    ${capa && (capa.lugares.length || capa.bloques.length || capa.ocultos.length) ? crudo(`
      <div class="panel__seccion">
        <h2 class="titulo-2">Tus cambios en el itinerario</h2>
        <p class="menudo" style="margin-top:4px">
          ${esc(plural(capa.lugares.length, 'parada añadida', 'paradas añadidas'))} y ${esc(plural(capa.ocultos.length, 'quitada', 'quitadas'))}.
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
      <h2 class="titulo-2">Este viaje en la nube</h2>
      <p class="menudo" style="margin-top:4px">
        De dónde sale lo que estás viendo. Tu cuenta y tus datos privados están en
        <a href="#/perfil">Tus datos</a>.
      </p>
      <p class="cuerpo" style="margin-top:var(--e3)">
        ${crudo(ORIGEN[nube.origen]?.(nube.version) || ORIGEN['sin-nube']())}${nube.pendientes ? crudo(`<span class="chip chip--alerta" style="margin-left:6px">${esc(nube.pendientes)} sin guardar</span>`) : ''}
      </p>
      ${!nube?.configurada ? crudo(`
        <p class="menudo" style="margin-top:var(--e3)">
          La nube no está configurada, así que este viaje solo vive en el repositorio y en
          este navegador. Para activarla hace falta <code>data/nube.json</code> —
          ver <code>supabase/LEEME.md</code>.
        </p>`) : !nube.usuario ? html`
        <a class="boton boton--principal boton--bloque" href="#/perfil" style="margin-top:var(--e3)">
          ${icono('nube')}Entrar para sincronizarlo
        </a>` : html`
        <button type="button" class="boton boton--bloque" data-accion="sincronizar" style="margin-top:var(--e3)">
          ${icono('importar')}Sincronizar ahora
        </button>`}
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
