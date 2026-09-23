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
import {
  describirCielo, tiempoDelDia, resumenDelTiempo, alcanceDeFecha, desdeCuando, HORIZONTE,
} from '../tiempo.js';
import {
  ESTADOS, FILTROS, estadoDeActividad, pasaFiltro, cuentasPorFiltro, resumenDelDia, esActividad, guardadoDe,
  TIPOS, TIPOS_RESERVA, CATEGORIAS_GASTO, tipoDeBloque, duracionDeBloque, reservasOrdenadas, reservasDelDia,
  resumenDeGastos, vivas,
} from '../actividades.js';

const minutosAhora = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

/**
 * Separador de miles a la española. A mano y no con `toLocaleString`, porque
 * este depende de los datos de ICU que traiga el navegador y en algunas
 * compilaciones devuelve el número pelado: «6717» en vez de «6.717».
 */
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// --- Distintivos de un bloque --------------------------------------------

/**
 * Los distintivos de una actividad en la cronología.
 *
 * **Solo lo que pide una decisión**: el nivel, que es lo que decide qué se
 * salta cuando el día se tuerce; el estado, cuando no es «por hacer»; y los
 * avisos de horario. Lo que antes también iba aquí —la categoría, el precio y
 * un «Abierto» verde en cada fila— sube a la línea de datos o se queda en la
 * ficha: una fila con seis distintivos no deja ver el que importa.
 */
function chipsDeBloque(bloque, dia, estadoActividad) {
  const lugar = bloque.lugar;
  const chips = [];

  if (bloque.propio) chips.push(html`<span class="chip chip--propio">${icono('mas')}Añadida por ti</span>`);

  if (estadoActividad === 'requiere-reserva') chips.push(html`<span class="chip chip--alerta">${icono('aviso')}Requiere reserva</span>`);
  else if (estadoActividad === 'reservado') chips.push(html`<span class="chip chip--ok">${icono('entrada')}Reservado</span>`);
  else if (estadoActividad === 'cancelado') chips.push(html`<span class="chip">${icono('cerrar')}Cancelado</span>`);

  const nivel = NIVELES[lugar.nivel];
  if (nivel) chips.push(html`<span class="chip ${nivel.clase}">${nivel.etiqueta}</span>`);

  if (bloque.opcional) chips.push(html`<span class="chip chip--saltable">Se puede saltar</span>`);

  if (bloque.exterior) {
    chips.push(html`<span class="chip">Por fuera</span>`);
  } else {
    const revision = revisarBloque(lugar, dia.fecha, bloque);
    if (revision.nivel === 'error') {
      chips.push(html`<span class="chip chip--error">${icono('aviso')}${revision.mensaje}</span>`);
    } else if (revision.nivel === 'aviso') {
      chips.push(html`<span class="chip chip--alerta">${icono('reloj')}Cierra antes de acabar</span>`);
    }
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

/**
 * El botón de estado de una actividad: el punto del raíl.
 *
 * Tocarlo marca o desmarca «hecho», que es lo que se hace veinte veces al día
 * andando. Lo demás —reservado, cancelado— se decide con calma desde la ficha.
 * El estado se dice con icono y con texto para lectores, no solo con color.
 */
export function botonDeEstado(bloque, estadoActividad) {
  const lugar = bloque.lugar;
  const hecho = estadoActividad === 'hecho';
  const cancelado = estadoActividad === 'cancelado';
  const info = ESTADOS[estadoActividad] || ESTADOS.pendiente;
  const etiqueta = cancelado
    ? `${lugar.nombre}: cancelado. Se cambia desde su ficha`
    : hecho ? `${lugar.nombre}: hecho. Tocar para desmarcar` : `Marcar ${lugar.nombre} como hecho`;
  return html`
    <button type="button" class="estado-boton" data-estado-actividad="${estadoActividad}"
            data-hecho="${lugar.id}" aria-pressed="${String(hecho)}" ${cancelado ? crudo('disabled') : ''}
            aria-label="${etiqueta}" title="${info.etiqueta}">${icono(info.icono)}</button>`;
}

/** Categoría · zona · precio: la segunda línea, que dice qué es y dónde. */
export function lineaDeDatos(bloque, moneda) {
  const lugar = bloque.lugar;
  const cat = CATEGORIAS[lugar.categoria] || CATEGORIAS.practico;
  const precio = bloque.coste ?? lugar.precio?.importe;
  // Un vuelo o un hotel añadidos dicen lo que son; lo del archivo, su categoría.
  const tipo = bloque.tipoActividad ? TIPOS[bloque.tipoActividad]?.etiqueta : null;
  return [
    tipo || cat.etiqueta,
    lugar.zona,
    !bloque.exterior && typeof precio === 'number' ? dinero(precio, moneda) : '',
  ].filter(Boolean).join(' · ');
}

function pintarBloqueVisita(bloque, dia, viaje, estado, actividad) {
  const lugar = bloque.lugar;
  const e = estadoDeActividad(bloque, actividad);
  const conNota = Boolean(estado.notas[lugar.id]);

  return html`
    <div class="bloque bloque--visita ${lugar.imagen ? 'bloque--con-foto' : ''} ${bloque.opcional ? 'bloque--opcional' : ''}"
         data-clave="${bloque.clave}" data-lugar="${lugar.id}" data-estado="${e}"
         data-visitado="${String(e === 'hecho')}">
      <span class="bloque__tiempo">
        ${bloque.inicio ? crudo(`<span class="bloque__hora">${esc(bloque.inicio)}</span>`) : ''}
        ${duracionDeBloque(bloque) ? crudo(`<span class="bloque__dur">${esc(duracionCorta(duracionDeBloque(bloque)))}</span>`) : ''}
      </span>
      <span class="bloque__rail">${botonDeEstado(bloque, e)}</span>
      <button type="button" class="bloque__principal">
        <span class="bloque__cuerpo">
          <span class="bloque__titulo">
            <span class="bloque__orden">${bloque.orden}</span>
            <span class="titulo-3">${lugar.nombre}</span>
            ${marcaDeNube(bloque)}
          </span>
          <span class="bloque__datos menudo">${lineaDeDatos(bloque, viaje.moneda)}</span>
          <span class="bloque__resumen secundario">${lugar.resumen}</span>
          <span class="bloque__chips">${chipsDeBloque(bloque, dia, e)}</span>
          ${bloque.nota ? crudo(`<span class="bloque__nota">${esc(bloque.nota)}</span>`) : ''}
          ${conNota ? crudo(`<span class="bloque__nota bloque__nota--mia">${esc(estado.notas[lugar.id])}</span>`) : ''}
        </span>
      </button>
      ${lugar.imagen ? crudo(`<img class="bloque__foto" src="${esc(lugar.imagen.archivo)}" alt=""
           loading="lazy" decoding="async" width="60" height="60"
           title="${esc(lugar.imagen.credito)}${lugar.imagen.licencia ? ' · ' + esc(lugar.imagen.licencia) : ''}">`) : ''}
      <a class="bloque__mapa" href="${enlaceLugar(lugar)}" target="_blank" rel="noopener noreferrer"
         aria-label="Ver ${lugar.nombre} en Google Maps" title="Ver en Google Maps">${icono('pin')}</a>
    </div>`;
}

/**
 * Un traslado es el tiempo entre dos actividades, y se pinta como tal: una
 * línea de enlace con la duración delante, no una fila más que compita con los
 * sitios. La duración sale de su hora de inicio y de fin, no de una estimación.
 */
function pintarBloqueTraslado(bloque) {
  const modo = MODOS[bloque.modo] || { etiqueta: 'Traslado', icono: 'adelante' };
  const minutos = (aMinutos(bloque.fin) - aMinutos(bloque.inicio)) || 0;
  const destino = bloque.lugarHasta?.nombre;
  const tramo = enlaceTramo(bloque.lugarDesde, bloque.lugarHasta, bloque.modo);

  return html`
    <div class="bloque bloque--traslado">
      <span class="bloque__tiempo"></span>
      <span class="bloque__rail"></span>
      <span class="bloque__cuerpo">
        <span class="conector">
          ${icono(modo.icono)}
          ${minutos > 0 ? crudo(`<b>${esc(duracionTexto(minutos))}</b><span aria-hidden="true">·</span>`) : ''}
          <span class="conector__modo">${modo.etiqueta}</span>
          ${destino ? crudo(`<span class="conector__destino">&rarr; ${esc(destino)}</span>`) : ''}
          ${bloque.opcional ? crudo('<span class="chip chip--saltable">Se puede saltar</span>') : ''}
        </span>
        ${bloque.detalle ? crudo(`<span class="conector__detalle menudo">${esc(bloque.detalle)}</span>`) : ''}
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
      ${bloque.propio ? html`<button type="button" class="bloque__mapa" data-editar="${bloque.claveActividad}"
          aria-label="Editar la nota ${bloque.titulo}" title="Editar">${icono('nota')}</button>` : ''}
    </div>`;
}

/**
 * Entre dos actividades que el reordenado ha dejado juntas sin un tramo del
 * plan, un enlace de «cómo llegar» **sin duración**: el tiempo que tardaba el
 * tramo original era de otro recorrido, y ponerlo sería inventarlo.
 */
function conectorLibre(desde, hasta) {
  const url = enlaceTramo(desde, hasta, 'a-pie');
  return html`
    <div class="bloque bloque--traslado bloque--libre">
      <span class="bloque__tiempo"></span>
      <span class="bloque__rail"></span>
      <span class="bloque__cuerpo">
        <span class="conector">${icono('adelante')}<span class="conector__destino">Hasta ${hasta.nombre}</span></span>
        <span class="conector__detalle menudo">Sin tramo planificado: el orden del día ha cambiado.</span>
      </span>
      ${url ? html`<a class="bloque__mapa bloque__mapa--tramo" href="${url}" target="_blank" rel="noopener noreferrer"
         aria-label="Cómo ir de ${desde.nombre} a ${hasta.nombre} en Google Maps" title="Cómo llegar">${icono('adelante')}</a>` : ''}
    </div>`;
}

/**
 * El día entero en Google Maps, con las paradas en orden.
 *
 * Se avisa cuando sale en modo coche y no lo es: Google no admite paradas
 * intermedias en transporte público, así que un día de tren cae a `driving`.
 * Decirlo evita que alguien lo siga creyendo que son las indicaciones reales.
 */
export function enlaceRuta(dia) {
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

export const lineaAhora = () => html`
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

export function pintarAviso(a) {
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
export function pintarTramo(t) {
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

// --- El tiempo ------------------------------------------------------------
// Tres piezas con trabajos distintos: la **tira** es lo que se lee sin abrir
// nada, dentro de la cabecera del día; las **horas** viven en una banda porque
// solo hacen falta cuando estás decidiendo a qué hora sales; y la **lista** de
// la portada es el viaje entero de un vistazo.

/** "25°", y una raya cuando no hay dato: un hueco vacío parece un fallo de pintado. */
const grados = (n) => (n === null || n === undefined ? '—' : `${Math.round(n)}°`);

/**
 * La tira compacta de un día.
 *
 * Va en la cabecera y no en una banda a propósito: en el móvil el panel asoma
 * 132 px sobre el mapa, y si llueve hay que saberlo sin abrir nada. Un dato que
 * cuesta un toque es un dato que se mira cuando ya te has mojado.
 */
export function tiraDeTiempo(t) {
  if (!t) return '';
  const cielo = describirCielo(t.codigo);
  return html`
    <div class="tiempo-tira">
      ${icono(cielo.icono, 'tiempo-tira__icono')}
      <span class="tiempo-tira__cielo">${cielo.texto}</span>
      <span class="tiempo-tira__temp">${grados(t.max)}<span class="tiempo-tira__min">${grados(t.min)}</span></span>
      <span class="tiempo-tira__datos">
        ${t.lluvia === null ? '' : html`<span class="tiempo-tira__dato ${t.lluvia >= 30 ? 'tiempo-tira__dato--alta' : ''}">${icono('gota')}${t.lluvia}%</span>`}
        ${t.viento === null ? '' : html`<span class="tiempo-tira__dato">${icono('viento')}${Math.round(t.viento)} km/h</span>`}
        ${t.atardecer ? html`<span class="tiempo-tira__dato">${icono('atardecer')}${t.atardecer}</span>` : ''}
      </span>
    </div>`;
}

/**
 * Las horas del día en las que se está en la calle, no las veinticuatro.
 *
 * La barra existe porque la forma del día se lee antes que los números: dónde
 * está el calor y a qué hora empieza a caer se ve de un vistazo, y las cifras
 * solo confirman. Se escala entre la mínima y la máxima **de esas horas**, no
 * del día entero, o un día llano saldría plano del todo.
 */
function pintarHoras(t) {
  const horas = t.horas || [];
  if (!horas.length) return '';
  const temps = horas.map((h) => h.t);
  const alta = Math.max(...temps);
  const baja = Math.min(...temps);
  const recorrido = alta - baja;
  // La fila de lluvia se reserva **por día y no por hora**: si se reservara por
  // hora, un día seco dejaría una banda vacía de 15 px debajo de las cifras, y
  // si no se reservara nada, en un día con dos horas de lluvia las columnas
  // tendrían alturas distintas y la fila entera bailaría.
  const conLluvia = horas.some((h) => h.p);

  return html`
    <div class="tiempo-horas scroll-x">
      ${horas.map((h) => {
        // Sin recorrido, todas a media altura: una barra al 100% mentiría.
        const alto = recorrido ? 8 + Math.round(((h.t - baja) / recorrido) * 26) : 18;
        const cielo = describirCielo(h.c);
        return html`
          <div class="tiempo-hora" title="${aHora(h.h * 60)} · ${cielo.texto}">
            <span class="tiempo-hora__h menudo">${h.h}</span>
            ${icono(cielo.icono, 'tiempo-hora__icono')}
            <span class="tiempo-hora__barra" aria-hidden="true"><i style="height:${alto}px"></i></span>
            <span class="tiempo-hora__t">${h.t}°</span>
            ${conLluvia ? html`<span class="tiempo-hora__p menudo ${h.p >= 30 ? 'tiempo-hora__p--alta' : ''}">${h.p ? `${h.p}%` : ''}</span>` : ''}
          </div>`;
      })}
    </div>
    <p class="menudo" style="margin-top:var(--e2)">
      ${t.amanecer ? `Amanece a las ${t.amanecer}` : ''}${t.amanecer && t.atardecer ? ' y anochece a las ' : ''}${t.atardecer || ''}${t.altitud === null ? '' : `. ${t.etiqueta || 'El punto medido'}, a ${miles(t.altitud)} m`}.
    </p>`;
}

/** Una fila de la lista del viaje: un día, con enlace a su día. */
function filaDeTiempo(viaje, dia, t, hoy) {
  const f = dia.fecha;
  const cabecera = html`
    <span class="tiempo-fila__fecha">
      <span class="tiempo-fila__dia">${NOMBRE_DIA[claveDia(f)].slice(0, 3)}</span>
      <span class="tiempo-fila__num">${Number(f.slice(8, 10))}</span>
    </span>`;

  if (!t) {
    const alcance = alcanceDeFecha(f, hoy);
    const motivo = alcance.estado === 'lejano'
      ? `Aún no hay predicción · faltan ${plural(alcance.dias - HORIZONTE, 'día')}`
      : 'Sin dato';
    return html`
      <a class="tiempo-fila tiempo-fila--vacia" href="#/v/${viaje.id}/d/${f}">
        ${cabecera}
        ${icono('practico', 'tiempo-fila__icono')}
        <span class="tiempo-fila__cuerpo"><span class="tiempo-fila__cielo menudo">${motivo}</span></span>
      </a>`;
  }

  const cielo = describirCielo(t.codigo);
  return html`
    <a class="tiempo-fila ${f === hoy ? 'tiempo-fila--hoy' : ''}" href="#/v/${viaje.id}/d/${f}">
      ${cabecera}
      ${icono(cielo.icono, 'tiempo-fila__icono')}
      <span class="tiempo-fila__cuerpo">
        <span class="tiempo-fila__cielo">${cielo.texto}</span>
        ${t.etiqueta ? crudo(`<span class="tiempo-fila__zona menudo">${esc(t.etiqueta)}</span>`) : ''}
      </span>
      ${t.lluvia === null ? '' : html`<span class="tiempo-fila__lluvia menudo ${t.lluvia >= 30 ? 'tiempo-fila__lluvia--alta' : ''}">${icono('gota')}${t.lluvia}%</span>`}
      <span class="tiempo-fila__temp"><b>${grados(t.max)}</b><span class="menudo">${grados(t.min)}</span></span>
    </a>`;
}

/**
 * El tiempo del viaje entero, para la portada.
 *
 * La sección se pinta **aunque no haya un solo dato**: es la respuesta a «¿qué
 * tiempo va a hacer?», y un hueco donde debería estar la respuesta obliga a
 * preguntarse si la guía lo sabe y no lo enseña o si es que no lo sabe.
 */
export function pintarTiempoDelViaje(viaje, tiempo) {
  const hoy = aIso(new Date());
  const resumen = resumenDelTiempo(tiempo, viaje);
  const dias = viaje.dias || [];

  let titular;
  if (!resumen) {
    const lejanos = dias.filter((d) => alcanceDeFecha(d.fecha, hoy).estado === 'lejano').length;
    titular = lejanos === dias.length && dias.length
      ? `Todavía no hay predicción: la de Open-Meteo llega a ${HORIZONTE} días vista.`
      : 'El tiempo llega en cuanto haya conexión. Lo último que se descargue se queda guardado para verlo sin ella.';
  } else {
    const agua = resumen.agua === 0
      ? 'Ninguno con lluvia'
      : `${plural(resumen.agua, 'día')} con lluvia`;
    const falta = resumen.faltan
      ? ` Faltan ${plural(resumen.faltan, 'día')}: la predicción llega a ${HORIZONTE} días vista.`
      : '';
    titular = `De ${grados(resumen.min)} a ${grados(resumen.max)} en ${plural(resumen.cuantos, 'día')}. ${agua}.${falta}`;
  }

  return html`
    <div class="panel__seccion">
      <h2 class="titulo-2">El tiempo</h2>
      <p class="secundario" style="margin-top:4px">${titular}</p>
      <p class="menudo" style="margin-top:6px">
        Medido en la zona de cada día y no en la ciudad base: sale del itinerario, igual que los tramos.
        Datos de <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>${tiempo?.generado ? `, ${desdeCuando(tiempo.generado)}` : ''}.
      </p>
      <div class="tiempo-lista">
        ${dias.map((d) => filaDeTiempo(viaje, d, tiempoDelDia(tiempo, d.fecha), hoy))}
      </div>
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
export function bandasDelDia(viaje, dia, estado, tiempo, capa = null) {
  const avisos = avisosDelDia(viaje, dia.fecha);
  const tramos = tramosDelDia(dia).filter((t, i) => !dia.bloques.filter((b) => b.tipo === 'traslado')[i]?.desfasado);
  const listas = listasDe(viaje, dia.fecha);
  const horas = tiempo?.horas?.length ? tiempo : null;
  const reservas = reservasDelDia(capa?.reservas, dia.fecha);
  if (!avisos.length && !tramos.length && !listas.length && !horas && !reservas.length) return '';

  const bandas = [];

  // Las reservas primero: el localizador es lo que se busca con prisa en la
  // puerta, y no puede estar debajo del tiempo que hace.
  if (reservas.length) {
    bandas.push(banda('reservas', {
      icono: 'entrada',
      titulo: reservas.length === 1 ? reservas[0].nombre : `${reservas.length} reservas de este día`,
      pista: reservas.length === 1 ? (reservas[0].hora || TIPOS_RESERVA[reservas[0].tipo]?.etiqueta || '') : '',
      cuerpo: html`${reservas.map((r) => pintarReserva(viaje, r, { compacta: true }))}`,
    }));
  }

  if (avisos.length) {
    const grave = avisos.some((a) => a.nivel === 'alto');
    bandas.push(banda('avisos', {
      icono: 'aviso',
      clase: grave ? 'banda--grave' : '',
      titulo: `${avisos.length} aviso${avisos.length === 1 ? '' : 's'} de este día`,
      cuerpo: html`${avisos.map(pintarAviso)}`,
    }));
  }

  // Antes que los traslados: el tiempo decide si el día se hace, y el traslado
  // solo cómo. La tira de la cabecera ya ha dicho lo esencial; esta banda es
  // para cuando estás eligiendo a qué hora sales.
  if (horas) {
    bandas.push(banda('tiempo', {
      icono: describirCielo(horas.codigo).icono,
      titulo: 'Hora a hora',
      pista: [`${grados(horas.max)} / ${grados(horas.min)}`, horas.lluvia === null ? '' : `${horas.lluvia}%`]
        .filter(Boolean).join(' · '),
      cuerpo: pintarHoras(horas),
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

/** «800 m», «5,9 km». La coma decimal a la española, sin depender de ICU. */
export function distanciaTexto(metros) {
  if (metros === null || metros === undefined) return '';
  if (metros < 1000) return `${Math.round(metros / 10) * 10} m`;
  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}

/**
 * El día en una fila de cifras: cuántas actividades, de qué hora a qué hora,
 * cuánto se anda, cuánto cuestan las entradas y qué reservas quedan.
 *
 * **Solo sale lo que se sabe.** Los kilómetros, si todos los tramos a pie dicen
 * su distancia; el coste, si alguna actividad tiene precio, y diciendo que es
 * por persona y de entradas, que es lo que el archivo guarda. Una cifra que no
 * está no se pinta como cero.
 */
export function pintarResumenDelDia(r, moneda, { gastado = 0 } = {}) {
  const piezas = [];
  if (r.actividades) piezas.push(html`<span class="cifra"><b>${r.actividades}</b> ${r.actividades === 1 ? 'actividad' : 'actividades'}</span>`);
  if (r.desde !== null && r.hasta !== null) piezas.push(html`<span class="cifra">${icono('reloj')}${aHora(r.desde)}–${aHora(r.hasta)}</span>`);
  if (r.aPie.minutos) {
    const km = r.aPie.metros !== null ? ` · ${distanciaTexto(r.aPie.metros)}` : '';
    piezas.push(html`<span class="cifra">${icono('a-pie')}${duracionTexto(r.aPie.minutos)}${km}</span>`);
  }
  const enTransporte = r.desplazamientos.minutos - r.aPie.minutos;
  if (enTransporte > 0) piezas.push(html`<span class="cifra">${icono('transporte')}${duracionTexto(enTransporte)} en transporte</span>`);
  if (r.coste.conPrecio) {
    // El icono del euro solo cuando es euros: con coronas checas, un € delante
    // de «450 CZK» contradice la cifra que acompaña.
    piezas.push(html`<span class="cifra">${icono(moneda === 'EUR' ? 'euro' : 'entrada')}${r.coste.importe ? `${dinero(r.coste.importe, moneda)} por persona en entradas` : 'Entradas gratis'}</span>`);
  }
  if (r.reservas.pendientes) {
    piezas.push(html`<span class="cifra cifra--alerta">${icono('aviso')}${r.reservas.pendientes} ${r.reservas.pendientes === 1 ? 'reserva pendiente' : 'reservas pendientes'}</span>`);
  }
  if (r.reservas.hechas) {
    piezas.push(html`<span class="cifra">${icono('entrada')}${r.reservas.hechas} ${r.reservas.hechas === 1 ? 'reservada' : 'reservadas'}</span>`);
  }
  if (gastado) piezas.push(html`<span class="cifra">${icono('gasto')}<b>${dinero(gastado, moneda)}</b> gastado</span>`);
  if (!piezas.length) return '';
  return html`<div class="resumen-dia" aria-label="Resumen del día">${piezas}</div>`;
}

/** Todas · Pendientes · Reservadas · Hechas, con cuántas hay en cada una. */
function pintarFiltros(cuentas, filtro, { ordenable = false } = {}) {
  return html`
    <div class="filtros" role="group" aria-label="Filtrar actividades">
      ${Object.entries(FILTROS).map(([id, f]) => html`
        <button type="button" class="filtro" data-filtro="${id}" aria-pressed="${String(filtro === id)}">
          ${f.etiqueta}<span class="filtro__n">${cuentas[id]}</span>
        </button>`)}
      ${ordenable ? html`<button type="button" class="filtro filtro--accion" data-accion="ordenar"
          title="Cambiar el orden de las actividades del día">${icono('asa')}Ordenar</button>` : ''}
    </div>`;
}

/**
 * El modo de ordenar: las actividades del día en una lista corta, con un asa
 * para arrastrar y flechas para quien no puede o no quiere arrastrar. Solo
 * actividades: los traslados unen sitios concretos y no se mueven solos.
 */
function pintarOrdenar(dia, { hayMovidos }) {
  const actividades = dia.bloques.filter(esActividad);
  return html`
    <section class="ordenar" data-ordenar aria-labelledby="ordenar-titulo">
      <h2 class="etiqueta" id="ordenar-titulo">Ordenar el día</h2>
      <p class="menudo">
        Arrastra por el asa o usa las flechas. Cada actividad toma la hora del hueco
        al que va y conserva su duración.
      </p>
      <ol class="ordenar__lista">
        ${actividades.map((b, i) => html`
          <li class="ordenar__fila" data-clave-orden="${b.claveActividad}">
            <button type="button" class="ordenar__asa" data-asa aria-label="Arrastrar ${b.lugar.nombre}"
                    aria-roledescription="asa de arrastre">${icono('asa')}</button>
            <span class="ordenar__hora">${b.inicio || ''}</span>
            <span class="ordenar__nombre">${b.lugar.nombre}</span>
            <button type="button" class="icono-boton ordenar__flecha ordenar__flecha--sube" data-mover="-1"
                    aria-label="Subir ${b.lugar.nombre}" ${i === 0 ? html`disabled` : ''}>${icono('flecha-abajo')}</button>
            <button type="button" class="icono-boton ordenar__flecha" data-mover="1"
                    aria-label="Bajar ${b.lugar.nombre}" ${i === actividades.length - 1 ? html`disabled` : ''}>${icono('flecha-abajo')}</button>
          </li>`)}
      </ol>
      <div class="ordenar__pie">
        ${hayMovidos ? html`<button type="button" class="boton boton--fantasma" data-accion="orden-original">Volver al orden del archivo</button>` : ''}
        <button type="button" class="boton boton--principal" data-accion="ordenar-listo">${icono('check')}Listo</button>
      </div>
    </section>`;
}

/** El número del día dentro del viaje: «Día 2». */
export const numeroDeDia = (viaje, fecha) => viaje.dias.findIndex((d) => d.fecha === fecha) + 1;

export function pintarDia(viaje, dia, estado, {
  ocultos = 0, tiempo = null, capa = null, filtro = 'todas', ordenando = false,
} = {}) {
  const tiempoHoy = tiempoDelDia(tiempo, dia.fecha);
  const intensidad = INTENSIDADES[dia.intensidad] || INTENSIDADES.suave;
  const esHoy = dia.fecha === aIso(new Date());
  const ahora = minutosAhora();
  const actividad = guardadoDe(estado, capa);
  const resumen = resumenDelDia(dia, actividad);
  const cuentas = cuentasPorFiltro(dia, actividad);
  const filtrando = filtro !== 'todas' && FILTROS[filtro];
  let puestaLaLinea = false;

  // Filtrando, solo quedan las actividades que pasan: los traslados y los hitos
  // unen actividades concretas, y entre dos que no son vecinas no significan
  // nada. La línea de «ahora» tampoco, porque ya no hay un día que recorrer.
  const visibles = filtrando
    ? dia.bloques.filter((b) => esActividad(b) && pasaFiltro(estadoDeActividad(b, actividad), filtro))
    : dia.bloques.filter((b) => !b.desfasado);

  // En un día reordenado, entre dos actividades sin tramo del plan que las una
  // va un «cómo llegar» sin duración. Pero **solo si en el archivo no iban
  // seguidas**: el funicular y la torre están uno al lado del otro y nunca
  // tuvieron traslado, y ponérselo por haber movido otra cosa sería ruido.
  // El orden original sale de la clave estable, que lleva la fecha y la hora
  // del archivo: no hace falta guardarlo aparte.
  const reordenado = !filtrando && dia.bloques.some((b) => b.movido);
  const seguidasEnElArchivo = (() => {
    const origen = dia.bloques.filter((b) => esActividad(b) && !b.propio)
      .map((b) => ({ clave: b.claveActividad, pos: b.claveActividad.split('|').slice(0, 2).join('|') }))
      .sort((x, y) => x.pos.localeCompare(y.pos));
    const indice = new Map(origen.map((x, i) => [x.clave, i]));
    return (a, b) => {
      const i = indice.get(a.claveActividad);
      const j = indice.get(b.claveActividad);
      return i !== undefined && j === i + 1 && origen[i].pos.slice(0, 10) === origen[j].pos.slice(0, 10);
    };
  })();
  let ultima = null;
  let conTramo = false;

  const cuerpo = visibles.map((bloque) => {
    let antes = '';
    if (reordenado) {
      if (bloque.tipo === 'traslado') conTramo = true;
      if (esActividad(bloque)) {
        if (ultima && !conTramo && !seguidasEnElArchivo(ultima, bloque)) antes += conectorLibre(ultima.lugar, bloque.lugar);
        ultima = bloque;
        conTramo = false;
      }
    }
    // La línea de «ahora» solo se pinta si hoy es este día. Justo antes del
    // primer bloque que todavía no ha empezado.
    if (!filtrando && esHoy && !puestaLaLinea && aMinutos(bloque.inicio) > ahora) {
      antes = lineaAhora();
      puestaLaLinea = true;
    }
    if (bloque.tipo === 'traslado') return antes + pintarBloqueTraslado(bloque);
    if (bloque.tipo === 'hito') return antes + pintarBloqueHito(bloque);
    if (!bloque.lugar) return antes;
    return antes + pintarBloqueVisita(bloque, dia, viaje, estado, actividad);
  }).join('');

  const cola = !filtrando && esHoy && !puestaLaLinea ? lineaAhora() : '';
  const n = numeroDeDia(viaje, dia.fecha);
  const actividades = dia.bloques.filter(esActividad);
  const ordenable = !filtrando && actividades.length > 1 && actividades.every((b) => b.inicio);
  const gastado = resumenDeGastos(capa?.gastos, { fecha: dia.fecha });

  let lista;
  if (ordenando && ordenable) {
    lista = pintarOrdenar(dia, { hayMovidos: dia.bloques.some((b) => b.movido) });
  } else if (!dia.bloques.length) {
    lista = crudo('<div class="vacio"><svg aria-hidden="true"><use href="#i-reloj"/></svg><p class="secundario">Este día no tiene nada planificado todavía.</p><p class="menudo" style="margin-top:6px">Añade la primera actividad con el botón de abajo.</p></div>');
  } else if (!visibles.length) {
    lista = html`<div class="vacio vacio--filtro"><p class="secundario">Ninguna actividad ${FILTROS[filtro].etiqueta.toLowerCase()} este día.</p>
      <button type="button" class="boton boton--fantasma" data-filtro="todas" style="margin-top:var(--e2)">Ver todas</button></div>`;
  } else {
    lista = crudo(`<div class="cronologia ${filtrando ? 'cronologia--filtrada' : ''}">${cuerpo}${cola}</div>`);
  }

  return html`
    ${barraPendientes(viaje.pendientes)}
    <div class="dia-cabecera">
      <p class="dia-cabecera__sobre">
        <span class="etiqueta">${n ? `Día ${n} · ` : ''}${fechaLarga(dia.fecha)}</span>
        ${esHoy ? crudo('<span class="chip chip--ok">Hoy</span>') : ''}
        <span class="chip ${intensidad.clase}">${intensidad.etiqueta}</span>
      </p>
      <h1 class="titulo-1" data-foco tabindex="-1">${dia.titulo}</h1>
      ${pintarResumenDelDia(resumen, viaje.moneda, { gastado: gastado.total })}
      ${tiraDeTiempo(tiempoHoy)}
      ${dia.resumen ? crudo(`<p class="dia-cabecera__resumen secundario">${esc(dia.resumen)}</p>`) : ''}
      ${enlaceRuta(dia)}
      ${bandasDelDia(viaje, dia, estado, tiempoHoy, capa)}
    </div>
    ${cuentas.todas && !ordenando ? pintarFiltros(cuentas, filtro, { ordenable }) : ''}
    ${lista}
    <div class="dia-editar">
      <button type="button" class="boton" data-accion="anadir-parada">${icono('mas')}Añadir una actividad</button>
      <button type="button" class="boton boton--fantasma" data-nuevo-gasto="" data-fecha="${dia.fecha}">${icono('gasto')}Apuntar un gasto</button>
      ${ocultos ? crudo(`<button type="button" class="boton boton--fantasma" data-accion="restaurar">
        ${esc(ocultos)} quitada${ocultos === 1 ? '' : 's'} · restaurar</button>`) : ''}
    </div>
  `;
}

// --- Ficha de lugar -------------------------------------------------------

/**
 * El estado de una actividad, elegido con nombre. Es el sitio donde se marca
 * reservado o cancelado; «hecho» también está, para que el control diga siempre
 * en qué estado estás sin tener que deducirlo del punto del raíl.
 *
 * «Por hacer» se llama «Por reservar» cuando el sitio pide reserva: es el mismo
 * estado de fondo, pero lo que falta hacer es otra cosa.
 */
const OPCIONES_DE_ESTADO = ['pendiente', 'reservado', 'hecho', 'cancelado'];

function selectorDeEstado(bloque, estadoActividad) {
  const actual = estadoActividad === 'requiere-reserva' ? 'pendiente' : estadoActividad;
  return html`
    <div class="selector-estado" role="radiogroup" aria-label="Estado de la actividad">
      ${OPCIONES_DE_ESTADO.map((id) => {
        const info = ESTADOS[id];
        const etiqueta = id === 'pendiente' && estadoActividad === 'requiere-reserva' ? 'Por reservar' : info.etiqueta;
        return html`
          <button type="button" class="selector-estado__opcion" role="radio" data-fijar-estado="${id}"
                  data-clave-actividad="${bloque.claveActividad}" data-lugar="${bloque.lugar.id}"
                  aria-checked="${String(actual === id)}">
            ${icono(id === 'pendiente' && estadoActividad === 'requiere-reserva' ? 'aviso' : info.icono)}<span>${etiqueta}</span>
          </button>`;
      })}
    </div>`;
}

export function pintarFicha(viaje, lugar, estado, { fecha, bloqueActual = null, capa = null } = {}) {
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
  if (typeof bloqueActual?.coste === 'number') filas.push(['Coste', html`${dinero(bloqueActual.coste, viaje.moneda)} <span class="menudo">por persona · apuntado por ti</span>`]);
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

      ${bloqueActual ? selectorDeEstado(bloqueActual, estadoDeActividad(bloqueActual, guardadoDe(estado, capa))) : ''}
      ${bloqueActual ? planDeLaActividad(viaje, bloqueActual, capa) : ''}

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
        ${bloqueActual ? '' : html`
        <button type="button" class="boton ${visitado ? '' : 'boton--principal'}" data-accion="visitado" aria-pressed="${String(visitado)}">
          ${icono('check')}${visitado ? 'Visitado' : 'Marcar visitado'}
        </button>`}
        <a class="boton" href="${enlaceLugar(lugar)}"
           target="_blank" rel="noopener noreferrer">${icono('pin')}Ver en Google Maps</a>
        <a class="boton" href="${enlaceComoLlegar(lugar)}"
           target="_blank" rel="noopener noreferrer">${icono('adelante')}Cómo llegar</a>
        ${bloqueActual?.url ? html`<a class="boton" href="${bloqueActual.url}" target="_blank" rel="noopener noreferrer">${icono('enlace')}Web o entradas</a>` : ''}
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
export function pintarContratos(viaje, { foco = false } = {}) {
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

// --- Reservas -------------------------------------------------------------

/** Una actividad en la lista de reservas: cuándo, qué, y qué hacer con ella. */
function filaDeReserva(viaje, dia, bloque, e) {
  const lugar = bloque.lugar;
  const nota = bloque.reserva?.nota || lugar.reserva?.nota;
  const web = (lugar.enlaces || [])[0];
  return html`
    <div class="reserva" data-estado="${e}">
      <a class="reserva__fecha" href="#/v/${viaje.id}/d/${dia.fecha}">
        <span class="reserva__dia">${NOMBRE_DIA[claveDia(dia.fecha)].slice(0, 3)}</span>
        <span class="reserva__num">${Number(dia.fecha.slice(8, 10))}</span>
      </a>
      <div class="reserva__cuerpo">
        <a class="titulo-3 reserva__nombre" href="#/v/${viaje.id}/l/${lugar.id}?d=${dia.fecha}">${lugar.nombre}</a>
        <p class="menudo">${bloque.inicio ? `${bloque.inicio} · ` : ''}${lineaDeDatos(bloque, viaje.moneda)}</p>
        ${nota ? crudo(`<p class="reserva__nota">${esc(nota)}</p>`) : ''}
        <div class="reserva__acciones">
          ${e === 'requiere-reserva'
            ? html`<button type="button" class="boton boton--principal" data-fijar-estado="reservado"
                     data-clave-actividad="${bloque.claveActividad}" data-lugar="${lugar.id}">${icono('entrada')}Marcar como reservada</button>`
            : html`<button type="button" class="boton boton--fantasma" data-fijar-estado="pendiente"
                     data-clave-actividad="${bloque.claveActividad}" data-lugar="${lugar.id}">Deshacer</button>`}
          ${web ? html`<a class="boton" href="${web.url}" target="_blank" rel="noopener noreferrer">${icono('enlace')}${web.texto}</a>` : ''}
        </div>
      </div>
    </div>`;
}

/**
 * Lo que hay que reservar y lo que ya está reservado, del viaje entero.
 *
 * Sale del mismo estado que se pinta en la cronología: una actividad cuyo
 * sitio pide reserva está aquí hasta que alguien la marca, y al marcarla pasa a
 * «Reservadas» en los dos sitios a la vez. Los contratos del viaje —el abono,
 * el coche de alquiler— van debajo, porque también son algo que se reserva.
 */
export function pintarReservas(viaje, estado, { capa = null } = {}) {
  const actividad = guardadoDe(estado, capa);
  const porReservar = [];
  const reservadas = [];
  for (const dia of viaje.dias) {
    for (const b of dia.bloques.filter(esActividad)) {
      const e = estadoDeActividad(b, actividad);
      if (e === 'requiere-reserva') porReservar.push({ dia, b, e });
      else if (e === 'reservado') reservadas.push({ dia, b, e });
    }
  }
  const hayContratos = Boolean(viaje.transporte?.length);

  const fichas = reservasOrdenadas(capa?.reservas);
  return html`
    <div class="panel__seccion">
      <h1 class="titulo-1" data-foco tabindex="-1">Reservas</h1>
      <p class="secundario" style="margin-top:4px">
        ${porReservar.length
          ? `${plural(porReservar.length, 'actividad pide', 'actividades piden')} reserva y ${porReservar.length === 1 ? 'no está marcada' : 'no están marcadas'}.`
          : reservadas.length ? 'No queda nada por reservar.' : 'Lo que se reserva, en un solo sitio.'}
      </p>
      <div class="reservas-acciones">
        <button type="button" class="boton boton--principal" data-nueva-reserva="">${icono('mas')}Añadir reserva</button>
        <a class="boton" href="#/v/${viaje.id}/gastos">${icono('gasto')}Gastos</a>
      </div>
    </div>

    ${fichas.length ? html`
      <div class="panel__seccion">
        <h2 class="titulo-2">Tus reservas</h2>
        <div class="reservas-fichas">${fichas.map((r) => pintarReserva(viaje, r))}</div>
      </div>` : ''}

    ${porReservar.length ? html`
      <div class="panel__seccion">
        <h2 class="titulo-2">Por reservar</h2>
        <div class="reservas">${porReservar.map(({ dia, b, e }) => filaDeReserva(viaje, dia, b, e))}</div>
      </div>` : ''}

    ${reservadas.length ? html`
      <div class="panel__seccion">
        <h2 class="titulo-2">Reservadas</h2>
        <div class="reservas">${reservadas.map(({ dia, b, e }) => filaDeReserva(viaje, dia, b, e))}</div>
      </div>` : ''}

    ${pintarContratos(viaje)}

    ${!porReservar.length && !reservadas.length && !hayContratos && !fichas.length ? html`
      <div class="vacio">
        ${icono('entrada')}
        <p class="secundario">Ninguna actividad de este viaje pide reserva.</p>
        <p class="menudo" style="margin-top:8px">
          Cuando reserves algo, márcalo desde su ficha: tócalo en el itinerario y elige «Reservado».
        </p>
      </div>` : !porReservar.length && !reservadas.length ? html`
      <p class="menudo" style="padding:0 var(--e4) var(--e4)">
        Ninguna actividad pide reserva. Si reservas alguna, márcala desde su ficha y saldrá aquí.
      </p>` : ''}
  `;
}

// --- Plan de una actividad: editar, su reserva y sus gastos ------------------

/**
 * Lo que se planifica de una actividad, en su ficha: editarla, su reserva con
 * el localizador a la vista, y lo que se ha gastado en ella. Cada cosa con su
 * botón, y lo que ya hay, encima de los botones.
 */
function planDeLaActividad(viaje, bloque, capa) {
  const clave = bloque.claveActividad;
  const reservas = reservasOrdenadas(capa?.reservas).filter((r) => r.actividad === clave);
  const gastos = vivas(capa?.gastos).filter((g) => g.actividad === clave);
  const total = resumenDeGastos(gastos).total;
  return html`
    <div class="plan">
      ${reservas.map((r) => pintarReserva(viaje, r, { compacta: true }))}
      ${gastos.length ? html`<p class="plan__gastos menudo">${icono('gasto')}${plural(gastos.length, 'gasto')} · <b>${dinero(total, viaje.moneda)}</b></p>` : ''}
      <div class="plan__acciones">
        <button type="button" class="boton" data-editar="${clave}">${icono('nota')}Editar</button>
        <button type="button" class="boton" data-nueva-reserva="${clave}" data-fecha="${bloque.fechaDia || ''}">${icono('entrada')}${reservas.length ? 'Otra reserva' : 'Añadir reserva'}</button>
        <button type="button" class="boton" data-nuevo-gasto="${clave}">${icono('gasto')}Apuntar gasto</button>
      </div>
    </div>`;
}

// --- Reservas con localizador ------------------------------------------------

/**
 * Una reserva. El localizador va en grande y con «Copiar», porque es lo que se
 * enseña en un mostrador o se pega en la web de la aerolínea con prisa.
 */
export function pintarReserva(viaje, r, { compacta = false } = {}) {
  const tipo = TIPOS_RESERVA[r.tipo] || TIPOS_RESERVA.otro;
  const cuando = [
    r.fecha ? fechaLarga(r.fecha) : '',
    r.hora || '',
    r.hasta ? `hasta el ${fechaLarga(r.hasta)}` : '',
  ].filter(Boolean).join(' · ');
  const actividad = r.actividad
    ? viaje.dias.flatMap((d) => d.bloques.map((b) => ({ b, d }))).find(({ b }) => b.claveActividad === r.actividad)
    : null;
  return html`
    <article class="reserva-ficha ${compacta ? 'reserva-ficha--compacta' : ''}">
      <span class="reserva-ficha__icono">${icono(tipo.icono)}</span>
      <div class="reserva-ficha__cuerpo">
        <p class="etiqueta reserva-ficha__tipo">${tipo.etiqueta}${cuando ? ` · ${cuando}` : ''}</p>
        <h3 class="titulo-3">${r.nombre}</h3>
        ${r.localizador ? html`
          <div class="localizador">
            <code class="localizador__codigo">${r.localizador}</code>
            <button type="button" class="boton boton--fantasma localizador__copiar" data-copiar="${r.localizador}"
                    aria-label="Copiar el número de reserva ${r.localizador}">Copiar</button>
          </div>` : ''}
        ${r.lugar ? html`<p class="menudo">${icono('pin')}${r.lugar}</p>` : ''}
        ${!compacta && actividad ? html`<p class="menudo">Para <a href="#/v/${viaje.id}/l/${actividad.b.lugar.id}?d=${actividad.d.fecha}">${actividad.b.lugar.nombre}</a></p>` : ''}
        ${r.notas ? html`<p class="reserva-ficha__notas">${r.notas}</p>` : ''}
        <div class="reserva-ficha__acciones">
          ${r.url ? html`<a class="boton boton--fantasma" href="${r.url}" target="_blank" rel="noopener noreferrer">${icono('enlace')}Abrir</a>` : ''}
          <button type="button" class="boton boton--fantasma" data-editar-reserva="${r.id}">Editar</button>
        </div>
      </div>
    </article>`;
}

// --- Gastos ---------------------------------------------------------------------

/**
 * Lo gastado del viaje: una cifra, el reparto por categoría y el día a día.
 *
 * El reparto son barras finas de **un solo color**: la categoría ya la dice su
 * nombre, y cinco colores serían decoración. Cada fila lleva su importe
 * escrito, así que la lista es también la tabla: ningún valor depende de pasar
 * el ratón.
 */
export function pintarGastos(viaje, estado, { capa = null } = {}) {
  const gastos = vivas(capa?.gastos).sort((a, b) => `${b.fecha}`.localeCompare(`${a.fecha}`));
  const r = resumenDeGastos(gastos);
  const moneda = viaje.moneda || 'EUR';
  const maximo = Math.max(...r.porCategoria.map((c) => c.importe), 0);
  const entradas = viaje.dias.reduce((s, d) => s + resumenDelDia(d, guardadoDe(estado, capa)).coste.importe, 0);
  const porDia = viaje.dias.filter((d) => r.porDia[d.fecha]);

  return html`
    <div class="panel__seccion">
      <h1 class="titulo-1" data-foco tabindex="-1">Gastos</h1>
      ${r.cuantos ? html`
        <div class="gastos-cifra">
          <span class="gastos-cifra__valor">${dinero(r.total, moneda)}</span>
          <span class="secundario">gastado en ${plural(r.cuantos, 'apunte')}</span>
        </div>` : html`
        <p class="secundario" style="margin-top:var(--e2)">
          Todavía no hay nada apuntado. Apunta lo que vais pagando y aquí saldrá sumado por categoría y por día.
        </p>`}
      ${entradas ? html`<p class="menudo" style="margin-top:var(--e2)">Las entradas que dice el itinerario suman ${dinero(entradas, moneda)} por persona.</p>` : ''}
      <button type="button" class="boton boton--principal boton--grande" data-nuevo-gasto="" style="margin-top:var(--e4)">${icono('mas')}Apuntar un gasto</button>
    </div>

    ${r.porCategoria.length ? html`
      <div class="panel__seccion">
        <h2 class="titulo-2">Por categoría</h2>
        <ul class="reparto">
          ${r.porCategoria.map((c) => html`
            <li class="reparto__fila">
              <span class="reparto__nombre">${icono(CATEGORIAS_GASTO[c.categoria].icono)}${CATEGORIAS_GASTO[c.categoria].etiqueta}</span>
              <span class="reparto__valor">${dinero(c.importe, moneda)}<span class="menudo"> · ${Math.round((c.importe / r.total) * 100)} %</span></span>
              <span class="reparto__barra" aria-hidden="true"><i style="width:${maximo ? Math.max(2, (c.importe / maximo) * 100) : 0}%"></i></span>
            </li>`)}
        </ul>
      </div>` : ''}

    ${porDia.length ? html`
      <div class="panel__seccion">
        <h2 class="titulo-2">Por día</h2>
        <ul class="gastos-dias">
          ${porDia.map((d) => html`
            <li><a href="#/v/${viaje.id}/d/${d.fecha}">${fechaLarga(d.fecha)}</a><b>${dinero(r.porDia[d.fecha], moneda)}</b></li>`)}
        </ul>
      </div>` : ''}

    ${gastos.length ? html`
      <div class="panel__seccion">
        <h2 class="titulo-2">Apuntes</h2>
        <ul class="apuntes">
          ${gastos.map((g) => html`
            <li class="apunte">
              <span class="apunte__icono">${icono(CATEGORIAS_GASTO[g.categoria]?.icono || 'nota')}</span>
              <span class="apunte__texto"><span class="titulo-3">${g.concepto}</span><span class="menudo">${g.fecha ? fechaLarga(g.fecha) : ''}</span></span>
              <b class="apunte__importe">${dinero(g.importe, moneda)}</b>
              <button type="button" class="icono-boton" data-editar-gasto="${g.id}" aria-label="Editar ${g.concepto}">${icono('nota')}</button>
            </li>`)}
        </ul>
      </div>` : ''}

    <p class="menudo" style="padding:0 var(--e4) var(--e6)">
      Los gastos van con el viaje: si está en la nube, los ven sus miembros. Nunca van al repositorio.
    </p>`;
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
  capa = null, nube = null, tareas = {}, atencion = () => false, tiempo = null, local = false,
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

    ${pintarTiempoDelViaje(viaje, tiempo)}

    <div class="panel__seccion">
      <h2 class="titulo-2">Del viaje entero</h2>
      <div style="margin-top:var(--e3)">
        ${filaDeSeccion({
          url: `#/v/${viaje.id}/transporte`,
          nombreIcono: 'transporte',
          titulo: 'Transporte',
          pista: tramos ? `${tramos} tramos, calculados del itinerario` : 'Contratos y reservas',
        })}
        ${filaDeSeccion({
          url: `#/v/${viaje.id}/gastos`,
          nombreIcono: 'gasto',
          titulo: 'Gastos',
          pista: (() => { const g = resumenDeGastos(capa?.gastos); return g.cuantos ? `${dinero(g.total, viaje.moneda || 'EUR')} en ${plural(g.cuantos, 'apunte')}` : 'Apunta lo que se va gastando'; })(),
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

    ${local ? html`
      <div class="panel__seccion">
        <h2 class="titulo-2">Creado en este navegador</h2>
        <p class="menudo" style="margin-top:4px">
          Este viaje no tiene archivo en el repositorio: vive aquí${nube.version !== null ? ' y en la nube' : ''}.
          ${nube.version === null ? 'Para que lo vea quien viaja contigo, publícalo en la nube desde la sección de arriba.' : ''}
        </p>
        <button type="button" class="boton boton--peligro" data-accion="borrar-viaje" style="margin-top:var(--e3)">
          ${icono('papelera')}Borrar este viaje de este navegador
        </button>
      </div>` : ''}

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
