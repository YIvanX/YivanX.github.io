/**
 * Vista de un viaje: barra de días, panel y mapa, sincronizados en los dos
 * sentidos.
 *
 * Se monta una sola vez por viaje. Cambiar de día o abrir una ficha **no**
 * vuelve a crear el mapa: reconstruirlo en cada navegación haría parpadear las
 * teselas y perdería el encuadre, que es de las cosas que más delatan una web
 * hecha con prisa.
 *
 * **Por qué no hay barra de pestañas.** La tenía, con Itinerario, Transporte,
 * Listas y Viaje como hermanas, y no lo eran: una era un día, dos eran tablas
 * del viaje entero y la cuarta era el viaje que contiene a las otras tres. La
 * propia barra de días lo delataba desapareciendo en tres de las cuatro. Ahora
 * la jerarquía la lleva la cabecera: el título sube a la portada del viaje, y de
 * la portada cuelga todo lo demás.
 *
 * La portada, Transporte y Listas **no usan el mapa**, pero se pintan igual
 * dentro de esta vista y solo ensanchan el panel por CSS. Sacarlas fuera de
 * `montarViaje` habría destruido y reconstruido el mapa en cada ida y vuelta,
 * que es justo lo que dice el párrafo de arriba que no se puede hacer.
 */

import { html, esc, icono, crudo, plural, $, $$, alPulsar, muelle, proyectar, gomaElastica, transicion } from '../ui/dom.js';
import { cargarViaje, diaPorDefecto, recuadroDe, INTENSIDADES, recomponer, viajeBase, versionNubeDe, fijarVersionNube, origenDe, fijarCapaSubida } from '../datos.js';
import { Mapa } from '../mapa.js';
import { crearHoja, CONSULTA_HOJA } from '../ui/hoja.js';
import { brindis, actualizarBrindis } from '../ui/brindis.js';
import * as buscador from '../ui/buscador.js';
import * as buscarLugar from '../ui/buscar-lugar.js';
import { lugarDesdeBusqueda, claveEstable, nuevoId, ocultosDelDia, comoJsonDelViaje } from '../personalizacion.js';
import * as estado from '../estado.js';
import * as nube from '../nube.js';
import * as sincronizacion from '../sincronizacion.js';
import { esOscuro, alCambiarTema } from '../ui/tema.js';
import { aIso, aFecha, fechaLarga, CLAVES_DIA, NOMBRE_DIA } from '../horarios.js';
import {
  pintarDia, pintarFicha, pintarTransporte, pintarListas, pintarPortada,
  pintarPreparativos, pintarAlVolver,
} from './panel.js';
import { hayPreViaje, hayPostViaje, diaTieneAtencion } from '../agenda.js';

/** Vistas que no necesitan el mapa: el panel se queda con todo el ancho. */
const ANCHAS = new Set(['portada', 'transporte', 'listas']);

/** Las dos pestañas de la barra de días que no son un día. */
const PSEUDODIAS = new Set(['pre', 'post']);

export async function montarViaje(raiz, ruta) {
  // Las dos lecturas de la nube van en paralelo y no en fila: cada una tiene su
  // propio límite de espera, y encadenarlas duplicaría el peor caso al abrir la
  // guía con el proyecto de Supabase recién despertando.
  const [cargado, estadoRemoto] = await Promise.all([
    cargarViaje(ruta.viajeId),
    sincronizacion.bajarEstado(ruta.viajeId),
  ]);
  let viaje = cargado;
  estado.fusionarRemoto(ruta.viajeId, estadoRemoto);

  const nubeLista = await nube.configurada();
  let actual = { ...ruta, fecha: ruta.fecha || diaPorDefecto(viaje) };
  let verTodo = false;
  const urlsObjeto = new Set();

  raiz.className = '';
  raiz.innerHTML = html`
    <div class="app">
      <header class="cabecera">
        <a class="icono-boton" href="#/" aria-label="Volver al registro">${icono('atras')}</a>
        <a class="cabecera__marca" href="#/v/${viaje.id}/portada">
          <span class="cabecera__logo">${viaje.titulo}</span>
          <span class="cabecera__contexto menudo">${viaje.subtitulo || ''}</span>
        </a>
        <div class="cabecera__acciones">
          <a class="icono-boton" href="#/v/${viaje.id}/portada" data-seccion="portada"
             aria-label="El viaje entero" title="El viaje">${icono('maleta')}</a>
          <button type="button" class="icono-boton" data-accion="buscar" aria-label="Buscar (Ctrl+K)" title="Buscar">${icono('buscar')}</button>
          <a class="icono-boton" href="#/perfil" aria-label="Tus datos y tu cuenta" title="Tus datos">${icono('persona')}</a>
        </div>
      </header>

      <nav class="barra-dias" aria-label="Días del viaje"></nav>

      <div class="escenario">
        <section class="panel" aria-label="Itinerario">
          <div class="tirador" aria-hidden="true"></div>
          <p class="solo-lectores" aria-live="polite" data-anuncio></p>
          <div class="panel__cuerpo scroll-y" data-cuerpo></div>
        </section>

        <div class="mapa-zona">
          <div class="mapa" data-mapa></div>
          <div class="mapa-controles">
            <div class="mapa-zoom">
              <button type="button" class="mapa-boton" data-mapa-accion="acercar" aria-label="Acercar">${icono('mas')}</button>
              <button type="button" class="mapa-boton" data-mapa-accion="alejar" aria-label="Alejar">${icono('menos')}</button>
            </div>
            <button type="button" class="mapa-boton" data-mapa-accion="todo" aria-pressed="false" aria-label="Ver todos los lugares del viaje">${icono('capas')}</button>
            <button type="button" class="mapa-boton" data-mapa-accion="localizar" aria-label="Mi ubicación">${icono('localizar')}</button>
            <button type="button" class="mapa-boton" data-mapa-accion="sinconexion" aria-label="Preparar este día sin conexión">${icono('sinconexion')}</button>
          </div>
        </div>
      </div>
    </div>`;

  const barraDias = $('.barra-dias', raiz);
  const panel = $('.panel', raiz);
  const cuerpo = $('[data-cuerpo]', raiz);
  const anuncio = $('[data-anuncio]', raiz);
  const nodoMapa = $('[data-mapa]', raiz);

  // --- Mapa ---------------------------------------------------------------
  // Cuánto mapa tapa la hoja por abajo. Se define antes de crear el mapa para
  // que el primer encuadre ya la tenga en cuenta y no haya que recolocarlo.
  const margenInferior = () => (matchMedia(CONSULTA_HOJA).matches
    ? Math.max(0, Math.round(innerHeight - panel.getBoundingClientRect().top))
    : 0);

  const mapa = new Mapa(nodoMapa);
  const diaInicial = viaje.dias.find((d) => d.fecha === actual.fecha) || viaje.dias[0];
  await mapa.iniciar({
    centro: viaje.mapa?.centro || [40, -4],
    zoom: viaje.mapa?.zoom || 8,
    oscuro: esOscuro(),
    puntos: diaInicial.paradas.map((p) => p.lugar.coords),
    margenInferior,
  });
  mapa.alSeleccionar = (lugarId) => {
    hoja.asomar();
    ir(`#/v/${viaje.id}/l/${lugarId}`);
  };
  const quitarOyenteTema = alCambiarTema((oscuro) => mapa.aplicarTema(oscuro));

  // --- Hoja (solo móvil) --------------------------------------------------
  const hoja = crearHoja(panel, {
    tirador: $('.tirador', raiz),
    cuerpo,
    alCambiar: () => mapa.refrescarTamano(),
  });

  const ir = (hash) => { location.hash = hash; };

  // --- Barra de días ------------------------------------------------------
  /**
   * Los días, con Preparativos delante y Al volver detrás.
   *
   * Los dos **no están en `viaje.dias`** a propósito: ese array va indexado por
   * fecha en todas partes —`aFecha`, `diasEntre`, el orden, el día por defecto,
   * las flechas del teclado— y meter una entrada con `fecha: 'pre'` habría
   * roto el orden y el día al que se entra. Son pestañas aparte, con su ruta
   * propia y su propio pintado.
   */
  function pintarBarraDias() {
    const hoy = aIso(new Date());
    const tareas = estado.estadoDe(viaje.id).tareas;

    // Enlaces y no botones: cada día **es** una URL, así que se puede abrir en
    // otra pestaña, copiar y recorrer con el teclado sin que haya que
    // programarlo. Y `aria-current` en vez de `aria-selected`: esto es
    // navegación, no un juego de pestañas con paneles.
    const pseudo = (id, etiqueta, abreviatura) => html`
      <a class="dia-tab dia-tab--pseudo" href="#/v/${viaje.id}/d/${id}"
         data-dia="${id}" aria-current="${actual.fecha === id ? 'page' : 'false'}" title="${etiqueta}">
        <span class="dia-tab__dia">${abreviatura}</span>
        <span class="dia-tab__num">${icono(id === 'pre' ? 'lista' : 'descarga')}</span>
      </a>`;

    const dias = viaje.dias.map((d) => {
      const f = aFecha(d.fecha);
      const puntos = (INTENSIDADES[d.intensidad] || INTENSIDADES.suave).puntos;
      const atencion = diaTieneAtencion(viaje, d.fecha, tareas);
      return html`
        <a class="dia-tab ${d.fecha === hoy ? 'dia-tab--hoy' : ''} ${atencion ? 'dia-tab--atencion' : ''}"
           href="#/v/${viaje.id}/d/${d.fecha}" data-dia="${d.fecha}"
           aria-current="${d.fecha === actual.fecha ? 'page' : 'false'}"
           aria-label="${d.titulo}${atencion ? ', tiene avisos o lista sin terminar' : ''}">
          <span class="dia-tab__dia" aria-hidden="true">${NOMBRE_DIA[CLAVES_DIA[f.getDay()]].slice(0, 3)}</span>
          <span class="dia-tab__num" aria-hidden="true">${f.getDate()}</span>
          <span class="dia-tab__pulso" aria-hidden="true">${[1, 2, 3].map((n) => crudo(`<i class="${n <= puntos ? 'on' : ''}"></i>`))}</span>
        </a>`;
    });

    barraDias.innerHTML = html`
      ${hayPreViaje(viaje) ? pseudo('pre', 'Preparativos', 'Antes') : ''}
      ${dias}
      ${hayPostViaje(viaje) ? pseudo('post', 'Al volver', 'Vuelta') : ''}`.toString();

    barraDias.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  /**
   * Reparte el espacio según lo que se esté enseñando.
   *
   * La barra de días solo tiene sentido dentro del itinerario. Y la portada,
   * Transporte y Listas no usan el mapa: en vez de desmontarlo —que costaría
   * reconstruirlo al volver— se esconde y el panel se queda con todo el ancho.
   */
  function repartirEspacio() {
    const enItinerario = ['dia', 'lugar', 'pre', 'post'].includes(actual.vista);
    const ancha = ANCHAS.has(actual.vista);
    barraDias.classList.toggle('oculto', !enItinerario);
    // El icono de la cabecera dice si ya estás en la portada, para que no sea un
    // botón que parece llevar a otro sitio cuando ya estás en él.
    $('[data-seccion="portada"]', raiz)?.setAttribute('aria-current', actual.vista === 'portada' ? 'page' : 'false');
    $('.escenario', raiz).classList.toggle('escenario--ancho', ancha);
    panel.classList.toggle('panel--ancho', ancha);
    // Leaflet mide al crearse y al recibir el aviso: sin esto, volver de una
    // vista ancha lo deja pintando con el ancho que tenía escondido.
    if (!ancha) requestAnimationFrame(() => mapa.refrescarTamano());
  }

  // --- Panel --------------------------------------------------------------
  function limpiarUrls() {
    for (const u of urlsObjeto) URL.revokeObjectURL(u);
    urlsObjeto.clear();
  }

  let primeraPintada = true;

  /**
   * De qué lado entra el día que se va a pintar: 1 por la derecha, -1 por la
   * izquierda, 0 sin entrada. **Lo fija solo el gesto**, justo antes de navegar,
   * y lo consume la siguiente pintada. Las flechas no lo tocan a propósito —
   * ver el comentario del teclado, más abajo.
   *
   * Es lo que hace que el gesto y su resultado sean la misma cosa: si el día
   * apareciera sin más, el desplazamiento del dedo no habría significado nada.
   */
  let entradaPendiente = 0;

  /**
   * El muelle solo mete el contenido nuevo desde 26 px: el viejo desaparece de
   * golpe. Cuando hay View Transition la usamos en su lugar, porque saca al
   * viejo *y* mete al nuevo, que es lo que hace que un día parezca una hoja que
   * se va y no un contenido que se sustituye. El muelle queda de reserva.
   */
  function animarEntrada({ loHaceLaTransicion = false } = {}) {
    const lado = entradaPendiente;
    entradaPendiente = 0;
    if (loHaceLaTransicion) {
      // El arrastre dejó `cuerpo` desplazado; si no se limpia, la foto del
      // antes sale torcida.
      resorteDesliz.fijar(0);
      return;
    }
    if (!lado || sinMovimiento.matches) return;
    resorteDesliz.fijar(lado * 26);
    resorteDesliz.hacia(0);
  }

  /** Lo último que se pintó, para saber de dónde venimos al elegir la transición. */
  let vistaPintada = null;
  let fechaPintada = null;

  /**
   * Qué transición toca, o `null` para ninguna.
   *
   * `null` es el caso más importante y el más fácil de olvidar: `pintarPanel`
   * también se llama al marcar algo visitado o al tocar una casilla, y un
   * fundido ahí sería un parpadeo gratuito en mitad de una acción.
   */
  function tipoDeTransicion() {
    if (actual.vista === vistaPintada && actual.fecha === fechaPintada) return null;
    if (vistaPintada === null) return null;   // primera pintada: no hay «antes»

    if (actual.vista === 'dia' && vistaPintada === 'dia') {
      const a = viaje.dias.findIndex((d) => d.fecha === fechaPintada);
      const b = viaje.dias.findIndex((d) => d.fecha === actual.fecha);
      if (a >= 0 && b >= 0 && a !== b) return b > a ? 'dia-der' : 'dia-izq';
      return 'fundido';
    }
    if (actual.vista === 'lugar') return 'entra';
    if (vistaPintada === 'lugar') return 'sale';
    return 'fundido';
  }

  /**
   * Lleva el foco al encabezado de lo que se acaba de abrir y lo anuncia.
   *
   * Solo al navegar: en la primera pintada se deja donde está, porque robarle el
   * foco a quien acaba de abrir la página es peor que no moverlo.
   */
  function situarFoco(texto) {
    if (anuncio) anuncio.textContent = texto;
    if (primeraPintada) { primeraPintada = false; return; }
    const destino = $('[data-foco]', cuerpo);
    if (destino) destino.focus({ preventScroll: true });
  }

  /**
   * El día que se está mirando. Siempre uno real: en Preparativos y en Al volver
   * `actual.fecha` vale 'pre' o 'post', y todo lo que necesite un día de verdad
   * —el mapa, la ficha de un lugar, la capa— tiene que seguir teniendo uno.
   */
  const diaActual = () => viaje.dias.find((d) => d.fecha === actual.fecha)
    || viaje.dias.find((d) => d.fecha === diaPorDefecto(viaje))
    || viaje.dias[0];

  /**
   * Marca la cronología para que sus filas entren escalonadas y le pone a cada
   * una su índice.
   *
   * El tope existe por una razón medible: sin él, un día de quince paradas
   * tardaría medio segundo en terminar de aparecer, y para entonces ya estás
   * leyendo la primera. A partir de la novena entran todas juntas.
   */
  const ESCALON_MAX = 8;

  function escalonarCronologia() {
    if (sinMovimiento.matches) return;
    const lista = $('.cronologia', cuerpo);
    if (!lista) return;
    lista.classList.add('cronologia--entra');
    $$(':scope > *', lista).forEach((fila, i) => {
      fila.style.setProperty('--i', String(Math.min(i, ESCALON_MAX)));
    });
  }

  function pintarPanel({ moverFoco = true } = {}) {
    const tipo = tipoDeTransicion();
    const conTransicion = Boolean(tipo && document.startViewTransition);
    // Escalonar solo al **llegar** a un día desde otra vista. Entre día y día
    // manda el desplazamiento lateral, y las dos cosas a la vez se pisan.
    const escalonar = actual.vista === 'dia' && vistaPintada !== 'dia';
    const aplicar = () => pintarPanelYa({ moverFoco, conTransicion, escalonar });

    if (conTransicion) transicion(aplicar, tipo);
    else aplicar();
  }

  function pintarPanelYa({ moverFoco, conTransicion, escalonar }) {
    limpiarUrls();
    const guardado = estado.estadoDe(viaje.id);

    if (actual.vista === 'lugar') {
      const lugar = viaje.porId.get(actual.lugarId);
      if (!lugar) { ir(`#/v/${viaje.id}`); return; }
      // El bloque concreto de este día, para poder quitarlo desde su ficha.
      const dia = diaActual();
      const bloqueActual = dia?.bloques.find((b) => b.tipo === 'visita' && b.lugar?.id === lugar.id) || null;
      cuerpo.innerHTML = pintarFicha(viaje, lugar, guardado, { fecha: dia?.fecha, bloqueActual });
      hidratarGaleria(lugar);
      if (moverFoco) situarFoco(lugar.nombre);
    } else if (actual.vista === 'transporte') {
      cuerpo.innerHTML = pintarTransporte(viaje);
      if (moverFoco) situarFoco('Transporte');
    } else if (actual.vista === 'listas') {
      cuerpo.innerHTML = pintarListas(viaje, guardado);
      if (moverFoco) situarFoco('Listas');
    } else if (actual.vista === 'pre') {
      cuerpo.innerHTML = pintarPreparativos(viaje, guardado);
      if (moverFoco) situarFoco('Preparativos');
    } else if (actual.vista === 'post') {
      cuerpo.innerHTML = pintarAlVolver(viaje, guardado);
      if (moverFoco) situarFoco('Al volver');
    } else if (actual.vista === 'portada') {
      cuerpo.innerHTML = pintarPortada(viaje, {
        capa: estado.capaDe(viaje.id),
        tareas: guardado.tareas,
        atencion: (fecha) => diaTieneAtencion(viaje, fecha, guardado.tareas),
        nube: {
          configurada: nubeLista,
          usuario: nube.usuario(),
          origen: origenDe(viaje.id),
          version: versionNubeDe(viaje.id),
          pendientes: viaje.pendientes,
        },
      });
      if (moverFoco) situarFoco(viaje.titulo);
    } else {
      const dia = diaActual();
      const base = viajeBase(viaje.id);
      const ocultos = base ? ocultosDelDia(base, estado.capaDe(viaje.id), dia.fecha).length : 0;
      cuerpo.innerHTML = pintarDia(viaje, dia, guardado, { ocultos });
      if (moverFoco) situarFoco(`${dia.titulo}, ${fechaLarga(dia.fecha)}`);
    }
    cuerpo.scrollTop = 0;
    if (escalonar) escalonarCronologia();
    animarEntrada({ loHaceLaTransicion: conTransicion });
    vistaPintada = actual.vista;
    fechaPintada = actual.fecha;
  }

  async function hidratarGaleria(lugar) {
    const galeria = $('[data-galeria]', cuerpo);
    if (!galeria) return;
    const fotos = await estado.fotosDe(viaje.id, lugar.id);
    const anadir = galeria.querySelector('.anadir-foto');
    for (const foto of fotos) {
      const url = URL.createObjectURL(foto.blob);
      urlsObjeto.add(url);
      const hueco = document.createElement('div');
      hueco.className = 'galeria__hueco';
      hueco.innerHTML = html`
        <img src="${url}" alt="Foto de ${lugar.nombre}" loading="lazy">
        <button type="button" class="galeria__quitar" data-quitar-foto="${foto.id}" aria-label="Quitar foto">${icono('cerrar')}</button>`;
      galeria.insertBefore(hueco, anadir);
    }
  }

  // --- Mapa por vista -----------------------------------------------------
  /** Preparativos y Al volver no son de ningún día: el mapa enseña el viaje entero. */
  const mapaDeTodo = () => verTodo || PSEUDODIAS.has(actual.fecha);

  function refrescarMapa() {
    const visitados = estado.estadoDe(viaje.id).visitados;
    if (mapaDeTodo()) mapa.mostrarTodo(viaje, { visitados });
    else mapa.mostrarDia(diaActual(), { visitados });
    if (actual.vista === 'lugar') mapa.irA(actual.lugarId, { abrirGlobo: false });
  }

  // --- Render completo ----------------------------------------------------
  let diaPintado = null;
  let modoPintado = null;

  function pintar() {
    pintarBarraDias();
    repartirEspacio();
    pintarPanel();

    const modo = mapaDeTodo() ? 'todo' : `dia:${diaActual()?.fecha}`;
    if (modo !== modoPintado) { refrescarMapa(); modoPintado = modo; diaPintado = actual.fecha; }
    else if (actual.vista === 'lugar') mapa.irA(actual.lugarId, { abrirGlobo: false });
    else mapa.destacar(null);
  }

  // --- Eventos ------------------------------------------------------------
  alPulsar(raiz, '[data-accion="buscar"]', () => abrirBuscador());

  // El `href` ya navega. Aquí solo queda apagar «ver todo el viaje»: elegir un
  // día concreto es decir que quieres mirar ese día y no el conjunto.
  alPulsar(barraDias, '[data-dia]', () => {
    verTodo = false;
    $('[data-mapa-accion="todo"]', raiz)?.setAttribute('aria-pressed', 'false');
  });

  alPulsar(cuerpo, '.bloque__principal', (b) => {
    const bloque = b.closest('.bloque--visita');
    if (!bloque) return;
    hoja.asomar();
    ir(`#/v/${viaje.id}/l/${bloque.dataset.lugar}?d=${diaActual().fecha}`);
  });

  alPulsar(cuerpo, '[data-accion="atras"]', () => ir(`#/v/${viaje.id}/d/${diaActual().fecha}`));
  alPulsar(cuerpo, '[data-accion="centrar"]', () => {
    mapa.irA(actual.lugarId);
    if (hoja.activa) hoja.ir('colapsada');
  });

  alPulsar(cuerpo, '[data-accion="visitado"]', () => {
    const ahora = estado.alternarVisitado(viaje.id, actual.lugarId);
    mapa.marcarVisitado(actual.lugarId, ahora);
    pintarPanel({ moverFoco: false });
    hidratarGaleria(viaje.porId.get(actual.lugarId));
    brindis(ahora ? 'Marcado como visitado' : 'Ya no está marcado', { tipo: ahora ? 'ok' : 'info' });
  });

  alPulsar(cuerpo, '[data-visto]', (b) => {
    const visto = estado.alternarVisto(viaje.id, b.dataset.visto);
    b.setAttribute('aria-checked', String(visto));
    // Solo el contador: repintar la ficha entera perdería el sitio del scroll
    // justo cuando estás de pie delante del sitio con el móvil en la mano.
    const seccion = b.closest('.mirar');
    const cuenta = $('[data-cuenta-mirar]', seccion);
    if (cuenta) {
      const total = $$('[data-visto]', seccion).length;
      cuenta.textContent = `${$$('[data-visto][aria-checked="true"]', seccion).length}/${total}`;
    }
  });

  alPulsar(cuerpo, '[data-tarea]', (b) => {
    const hecha = estado.alternarTarea(viaje.id, b.dataset.tarea);
    b.setAttribute('aria-checked', String(hecha));
    // Solo se repinta la barra de progreso: repintar la lista entera perdería
    // el sitio del scroll y la sensación de que el toque hizo algo.
    //
    // El ancla es `[data-lista]` y no `.panel__seccion`: la misma lista se pinta
    // ahora dentro de una banda del día, donde no hay ninguna sección, y ahí este
    // `closest` habría devuelto `null` al marcar la primera tarea.
    const seccion = b.closest('[data-lista]');
    if (!seccion) return;
    const total = $$('[data-tarea]', seccion).length;
    const hechas = $$('[data-tarea][aria-checked="true"]', seccion).length;
    $('.progreso-lista__valor', seccion).style.width = `${Math.round((hechas / total) * 100)}%`;
    $('.progreso-lista .menudo', seccion).textContent = `${hechas}/${total}`;

    // El resumen de la banda dice el mismo número desde fuera, y puede cubrir
    // varias listas: se cuenta sobre la banda entera. Dejarlo en «0/3» con una
    // tarea ya marcada debajo es peor que no decir nada.
    const banda = b.closest('.banda');
    const pista = banda && $('.banda__pista', banda);
    if (pista) {
      pista.textContent = `${$$('[data-tarea][aria-checked="true"]', banda).length}/${$$('[data-tarea]', banda).length}`;
    }
  });

  alPulsar(cuerpo, '[data-quitar-foto]', async (b, e) => {
    e.stopPropagation();
    await estado.borrarFoto(viaje.id, b.dataset.quitarFoto);
    b.closest('.galeria__hueco')?.remove();
    brindis('Foto quitada');
  });

  cuerpo.addEventListener('change', async (e) => {
    const campo = e.target.dataset?.campo;
    if (campo === 'foto') {
      const archivos = Array.from(e.target.files || []);
      if (!archivos.length) return;
      const lugar = viaje.porId.get(actual.lugarId);
      try {
        for (const archivo of archivos) await estado.anadirFoto(viaje.id, lugar.id, archivo);
        limpiarUrls();
        $$('.galeria__hueco', cuerpo).forEach((n) => n.remove());
        await hidratarGaleria(lugar);
        brindis(`${plural(archivos.length, 'foto guardada', 'fotos guardadas')}`, { tipo: 'ok' });
      } catch (err) {
        brindis(`No se ha podido guardar: ${err.message}`, { tipo: 'error', duracion: 5000 });
      }
      e.target.value = '';
    }
  });

  // La nota se guarda al salir del campo, no en cada tecla: escribir en
  // localStorage con cada pulsación es trabajo desperdiciado.
  cuerpo.addEventListener('blur', (e) => {
    if (e.target.dataset?.campo !== 'nota') return;
    estado.guardarNota(viaje.id, actual.lugarId, e.target.value);
  }, true);

  // Entrar y salir de la cuenta ya no se hacen desde aquí: son de la persona, no
  // del viaje, y viven en `#/perfil`. Lo que queda aquí es lo de **este** viaje.
  alPulsar(cuerpo, '[data-accion="sincronizar"]', async () => {
    try {
      // Ida y vuelta completa, en este orden a propósito: lo personal sube y
      // baja —fundiendo, nunca pisando—, y el itinerario compartido sube al
      // final para que salga con la capa ya fundida dentro.
      await nube.guardarEstado(viaje.id, estado.estadoDe(viaje.id));
      estado.fusionarRemoto(viaje.id, await sincronizacion.bajarEstado(viaje.id));

      if (versionNubeDe(viaje.id) === null) {
        // No basta con que la carga no trajera versión: pudo rendirse por tiempo
        // con el proyecto despertando, y entonces el viaje SÍ está en la nube.
        // Preguntar antes de crear evita chocar contra la clave primaria y
        // soltar un «duplicate key» que no le dice nada a nadie.
        const yaEsta = await nube.leerViaje(viaje.id);
        if (yaEsta) {
          fijarVersionNube(viaje.id, yaEsta.versionNube);
          fijarCapaSubida(viaje.id, sincronizacion.separar(yaEsta).capa || { version: 1, lugares: [], bloques: [], ocultos: [] });
          trasGuardar();
          await guardarEnNube();
        } else {
          // Publicar el viaje es un acto explícito, y este botón es dónde se hace.
          const capa = estado.capaDe(viaje.id);
          const creado = await nube.crearViaje(
            sincronizacion.juntar({ ...viajeBase(viaje.id), id: viaje.id }, capa),
          );
          fijarVersionNube(viaje.id, creado.versionNube);
          fijarCapaSubida(viaje.id, capa);
          trasGuardar();
          brindis('Viaje publicado en la nube. Ya se puede compartir.', { tipo: 'ok', duracion: 5000 });
        }
      } else if (viaje.pendientes) {
        await guardarEnNube();
      } else {
        brindis(`Al día con la nube · versión ${versionNubeDe(viaje.id)}. No había nada que subir.`, { tipo: 'ok', duracion: 5000 });
        trasGuardar();
      }
    } catch (e) {
      brindis(`No se ha podido sincronizar: ${e.message}`, { tipo: 'error', duracion: 6000 });
    }
  });

  alPulsar(cuerpo, '[data-accion="copiar-capa"]', async () => {
    const texto = JSON.stringify(comoJsonDelViaje(estado.capaDe(viaje.id)), null, 2);
    try {
      await navigator.clipboard.writeText(texto);
      brindis('Copiado. Pégalo en el JSON del viaje.', { tipo: 'ok', duracion: 5000 });
    } catch {
      // Sin permiso de portapapeles, se descarga: peor, pero no se pierde.
      const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `cambios-${viaje.id}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      brindis('Descargado como archivo', { tipo: 'ok' });
    }
  });

  alPulsar(cuerpo, '[data-accion="vaciar-capa"]', () => {
    const capa = estado.capaDe(viaje.id);
    const total = capa.bloques.length + capa.ocultos.length;
    if (!confirm(`Se van a deshacer ${plural(total, 'cambio')} del itinerario. Las notas, las fotos y lo visitado no se tocan.`)) return;
    estado.guardarCapa(viaje.id, { version: 1, lugares: [], bloques: [], ocultos: [] });
    trasCambiarCapa('Itinerario devuelto a como estaba');
  });

  // --- Añadir y quitar paradas del itinerario -----------------------------
  /**
   * Rehace el viaje con la capa nueva y repinta.
   *
   * Se recompone desde el JSON crudo que ya está en memoria: no se vuelve a
   * pedir nada a la red, así que añadir una parada funciona igual sin cobertura.
   */
  /**
   * ¿Hay a dónde subir ahora mismo? Todo síncrono a propósito: se consulta
   * mientras se decide qué enseñar, y un `await` ahí dentro haría que la
   * pantalla se pintara un instante antes de saberlo.
   */
  const puedeSubir = () => nubeLista && nube.haySesion() && versionNubeDe(viaje.id) !== null;

  // Se avisa una vez por tanda de cambios, no en cada navegación: repetir el
  // mismo aviso cada vez que tocas un día lo convierte en algo que se ignora.
  let avisadoDePendientes = false;

  function trasCambiarCapa(mensaje) {
    const rehecho = recomponer(viaje.id, { archivo: null });
    if (rehecho) viaje = rehecho;
    modoPintado = null;
    pintar();
    avisadoDePendientes = false;
    // El cambio ya está guardado en este dispositivo, y eso es lo que dice el
    // mensaje. Lo de la nube lo dice la barra de arriba, que no se va sola.
    if (mensaje) brindis(mensaje, { tipo: 'ok' });
  }

  /**
   * Sube a la nube todos los cambios del itinerario de una vez.
   *
   * **Se guarda cuando tú lo dices, no en cada toque.** Añadir tres paradas
   * seguidas eran antes tres escrituras y tres versiones nuevas; ahora es una.
   * Además, mientras editas, cada subida intermedia era una oportunidad de
   * chocar con la otra persona por un estado que ni siquiera habías terminado.
   *
   * Solo **actualiza**: publicar un viaje que todavía no está en la nube es un
   * acto aparte y se hace desde la portada del viaje.
   */
  async function guardarEnNube() {
    const version = versionNubeDe(viaje.id);
    if (!(await sincronizacion.activa()) || version === null) {
      brindis('No hay sesión en la nube. El itinerario sigue guardado en este dispositivo.', { tipo: 'info', duracion: 5000 });
      return false;
    }
    const cuantos = viaje.pendientes;
    const aviso = brindis('Subiendo a la nube…', { tipo: 'info', persistente: true });
    try {
      const capa = estado.capaDe(viaje.id);
      const guardado = await sincronizacion.subirViaje(viaje.id, viajeBase(viaje.id), capa, version);
      fijarVersionNube(viaje.id, guardado.versionNube);
      // La foto de referencia se actualiza SOLO después de que la escritura haya
      // ido bien. Si se moviera antes, un fallo de red dejaría los cambios
      // marcados como subidos sin estarlo, que es la peor mentira posible aquí.
      fijarCapaSubida(viaje.id, capa);
      trasGuardar();
      actualizarBrindis(aviso, `${cuantos} cambio${cuantos === 1 ? '' : 's'} en la nube · versión ${guardado.versionNube}`, { tipo: 'ok' });
      return true;
    } catch (e) {
      actualizarBrindis(aviso, e.conflicto
        ? 'Alguien ha cambiado este viaje desde otro sitio. Recarga antes de guardar, o le pisarás el cambio.'
        : `No ha subido: ${e.message}. Tus cambios siguen aquí.`,
      { tipo: 'error', duracion: 7000 });
      return false;
    }
  }

  /** Repinta con los estados de nube recalculados tras guardar. */
  function trasGuardar() {
    const rehecho = recomponer(viaje.id, { archivo: null });
    if (rehecho) viaje = rehecho;
    modoPintado = null;
    avisadoDePendientes = false;
    pintar();
  }

  alPulsar(cuerpo, '[data-accion="guardar-nube"]', guardarEnNube);

  function anadirParada({ resultado, fecha, inicio, fin, nota }) {
    const capa = estado.capaDe(viaje.id);
    const usados = new Set([...viaje.porId.keys(), ...capa.lugares.map((l) => l.id)]);
    let lugar;
    try {
      lugar = lugarDesdeBusqueda(resultado, usados);
    } catch (e) {
      brindis(e.message, { tipo: 'error' });
      return;
    }
    capa.lugares.push(lugar);
    capa.bloques.push({ id: nuevoId('bloque'), fecha, lugar: lugar.id, inicio, ...(fin ? { fin } : {}), ...(nota ? { nota } : {}) });
    estado.guardarCapa(viaje.id, capa);
    trasCambiarCapa(`${lugar.nombre} añadido al día`);
  }

  function abrirAnadir() {
    const dia = diaActual();
    const centro = dia.paradas[0]?.lugar.coords || viaje.mapa?.centro || [40, -4];

    const dialogo = buscarLugar.abrirAnadir({
      dia,
      centro,
      alGuardar: anadirParada,
      alElegirEnMapa() {
        brindis('Toca un punto del mapa. Escape para cancelar.', { duracion: 6000 });
        if (hoja.activa) hoja.ir('colapsada');
        mapa.elegirPunto((coords) => {
          const nuevo = buscarLugar.abrirAnadir({
            dia, centro, alGuardar: anadirParada, alElegirEnMapa: () => {},
          });
          nuevo.conPunto(coords);
          hoja.asomar();
        });
      },
    });
    return dialogo;
  }

  alPulsar(cuerpo, '[data-accion="anadir-parada"]', abrirAnadir);

  alPulsar(cuerpo, '[data-accion="quitar-parada"]', (b) => {
    const capa = estado.capaDe(viaje.id);
    const bloque = viaje.dias.flatMap((d) => d.bloques).find((x) => x.clave === b.dataset.clave);
    if (!bloque) return;

    if (bloque.propio) {
      // Lo añadido se borra de verdad; lo del JSON solo se oculta.
      capa.bloques = capa.bloques.filter((x) => x.id !== bloque.idPropio);
      const sigueUsado = capa.bloques.some((x) => x.lugar === bloque.lugar?.id);
      if (!sigueUsado) capa.lugares = capa.lugares.filter((l) => l.id !== bloque.lugar?.id);
    } else {
      const clave = claveEstable(diaActual().fecha, {
        lugar: bloque.lugar?.id, desde: bloque.desde, hasta: bloque.hasta,
        titulo: bloque.titulo, inicio: bloque.inicio, tipo: bloque.tipo,
      });
      if (!capa.ocultos.includes(clave)) capa.ocultos.push(clave);
    }
    estado.guardarCapa(viaje.id, capa);
    ir(`#/v/${viaje.id}/d/${diaActual().fecha}`);
    trasCambiarCapa('Quitado del itinerario');
  });

  alPulsar(cuerpo, '[data-accion="restaurar"]', () => {
    const capa = estado.capaDe(viaje.id);
    const base = viajeBase(viaje.id);
    const fecha = diaActual().fecha;
    const delDia = new Set(ocultosDelDia(base, capa, fecha)
      .map((b) => claveEstable(fecha, b)));
    capa.ocultos = capa.ocultos.filter((c) => !delDia.has(c));
    estado.guardarCapa(viaje.id, capa);
    trasCambiarCapa(plural(delDia.size, 'parada restaurada', 'paradas restauradas'));
  });

  // --- Sincronía cronología ↔ mapa (escritorio) ---------------------------
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    cuerpo.addEventListener('pointerover', (e) => {
      const bloque = e.target.closest('.bloque--visita');
      if (bloque) mapa.destacar(bloque.dataset.clave);
    });
    cuerpo.addEventListener('pointerleave', () => {
      if (actual.vista !== 'lugar') mapa.destacar(null);
    });
  }

  // --- Controles del mapa -------------------------------------------------
  alPulsar(raiz, '[data-mapa-accion]', async (b) => {
    const accion = b.dataset.mapaAccion;
    if (accion === 'acercar') mapa.mapa.zoomIn();
    else if (accion === 'alejar') mapa.mapa.zoomOut();
    else if (accion === 'todo') {
      verTodo = !verTodo;
      b.setAttribute('aria-pressed', String(verTodo));
      modoPintado = null;
      pintar();
    } else if (accion === 'localizar') {
      try { await mapa.localizar(); }
      catch (err) { brindis(err.message, { tipo: 'error' }); }
    } else if (accion === 'sinconexion') {
      await prepararSinConexion(b);
    }
  });

  async function prepararSinConexion(boton) {
    const dia = diaActual();
    const lugares = mapaDeTodo() ? viaje.lugaresUsados : dia.paradas.map((p) => p.lugar);
    const recuadro = recuadroDe(lugares, 0.03);
    if (!recuadro) { brindis('Este día no tiene lugares en el mapa', { tipo: 'error' }); return; }

    boton.disabled = true;
    const aviso = document.createElement('div');
    aviso.className = 'mapa-progreso';
    aviso.innerHTML = html`<span class="girador" style="width:13px;height:13px"></span><span>Preparando el mapa…</span>`;
    $('.mapa-zona', raiz).appendChild(aviso);

    try {
      const r = await mapa.prepararSinConexion(recuadro, {
        alProgreso: (hechas, total) => {
          $('span:last-child', aviso).textContent = `Preparando el mapa… ${Math.round((hechas / total) * 100)}%`;
        },
      });
      brindis(`Mapa listo sin conexión (${r.descargadas} teselas)`, { tipo: 'ok' });
    } catch {
      brindis('No se ha podido preparar el mapa', { tipo: 'error' });
    } finally {
      aviso.remove();
      boton.disabled = false;
    }
  }

  // --- Buscador -----------------------------------------------------------
  function abrirBuscador() {
    buscador.abrir(viaje, (r) => {
      if (r.tipo === 'lugar') { hoja.asomar(); ir(`#/v/${viaje.id}/l/${r.id}?d=${diaActual().fecha}`); }
      else ir(`#/v/${viaje.id}/d/${r.id}`);
    });
  }

  function alTeclado(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrirBuscador(); return; }
    if (buscador.abierto()) return;
    if (e.target.matches?.('input, textarea')) return;

    // Las flechas recorren solo días reales. Desde Preparativos o Al volver el
    // índice sale del día que se estaba mirando, no de una pestaña que no es
    // una fecha.
    const i = viaje.dias.findIndex((d) => d.fecha === diaActual()?.fecha);
    // Sin animación de entrada a propósito: una flecha se repite muchas veces
    // seguidas, y animar cada repetición hace que el teclado se sienta lento.
    // El gesto sí anima, porque ahí la animación **continúa** el movimiento.
    if (e.key === 'ArrowRight' && i < viaje.dias.length - 1) ir(`#/v/${viaje.id}/d/${viaje.dias[i + 1].fecha}`);
    else if (e.key === 'ArrowLeft' && i > 0) ir(`#/v/${viaje.id}/d/${viaje.dias[i - 1].fecha}`);
    else if (e.key === 'Escape' && actual.vista === 'lugar') ir(`#/v/${viaje.id}/d/${diaActual().fecha}`);
  }
  addEventListener('keydown', alTeclado);

  // --- Deslizar entre días -------------------------------------------------
  /**
   * Con el dedo, cambiar de día obliga a apuntar a una pestaña de 44 px en una
   * barra que además se desplaza. El gesto natural es el que ya hacen las
   * flechas del teclado: arrastrar a un lado pasa al día siguiente.
   *
   * **Solo con el dedo.** Con ratón, un arrastre horizontal es seleccionar
   * texto, y robárselo sería peor que no tener el gesto.
   *
   * Se construye con las mismas piezas que la hoja arrastrable, y por las mismas
   * razones —están en `docs/DECISIONES.md`:
   *
   *  · **`setPointerCapture` en cuanto se decide que el gesto es horizontal.**
   *    Sin captura, sacar el dedo del panel a mitad de arrastre mata el gesto.
   *  · **Decide la velocidad, no la distancia.** Un golpe seco corto tiene que
   *    pasar de día; un arrastre lento y largo que se frena, no. Se proyecta a
   *    dónde iba el gesto con `proyectar()` y se decide sobre esa proyección.
   *  · **Muelle en rAF, no transición de CSS.** Una transición no se puede
   *    agarrar a mitad: si vuelves a deslizar mientras el panel regresa, el
   *    muelle arranca del valor que hay en pantalla y hereda su velocidad.
   *  · **Goma elástica en los topes.** El primer día no tiene anterior, y eso se
   *    dice resistiendo cada vez más, no parándose en seco.
   */
  const UMBRAL_DESLIZ = 56;   // px proyectados para que el gesto cuente
  const DOMINANCIA = 1.4;     // cuánto más horizontal que vertical tiene que ser
  const SEGUIMIENTO = 0.32;   // el panel acompaña, no viaja: es una pista
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');

  const resorteDesliz = muelle((v) => {
    cuerpo.style.transform = Math.abs(v) < 0.5 ? '' : `translate3d(${v}px, 0, 0)`;
  });

  let desliz = null;
  const indiceDelDia = () => viaje.dias.findIndex((d) => d.fecha === diaActual()?.fecha);

  cuerpo.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || actual.vista !== 'dia' || desliz) return;
    // Dentro de un campo o de una banda, el arrastre es de ellos.
    if (e.target.closest('input, textarea, summary')) return;
    resorteDesliz.parar();
    desliz = { id: e.pointerId, x: e.clientX, y: e.clientY, decidido: false, activo: false, historial: [] };
  });

  cuerpo.addEventListener('pointermove', (e) => {
    if (!desliz || e.pointerId !== desliz.id) return;
    const dx = e.clientX - desliz.x;
    const dy = e.clientY - desliz.y;

    // La dirección se decide una vez y no se vuelve a discutir: si no, a mitad de
    // un scroll vertical el panel pega un tirón lateral.
    if (!desliz.decidido) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      desliz.decidido = true;
      desliz.activo = Math.abs(dx) > Math.abs(dy) * DOMINANCIA;
      if (!desliz.activo) { desliz = null; return; }
      cuerpo.dataset.deslizando = 'true';
      // La captura va aquí y no en el pointerdown: el panel es grande, así que no
      // se pierde el gesto por empezar tarde, y capturar cada toque estorbaría a
      // los botones que hay dentro.
      try { cuerpo.setPointerCapture(e.pointerId); } catch { /* sin captura se sigue */ }
    }

    desliz.historial.push({ t: performance.now(), x: e.clientX });
    if (desliz.historial.length > 6) desliz.historial.shift();

    if (sinMovimiento.matches) return;
    const i = indiceDelDia();
    const tope = (dx > 0 && i <= 0) || (dx < 0 && i >= viaje.dias.length - 1);
    const seguido = dx * SEGUIMIENTO;
    resorteDesliz.situar(tope
      ? Math.sign(dx) * gomaElastica(Math.abs(seguido), cuerpo.clientWidth || 320)
      : seguido);
  });

  function soltarDesliz(e) {
    if (!desliz || e.pointerId !== desliz.id) return;
    const { activo, historial } = desliz;
    const dx = e.clientX - desliz.x;
    try { cuerpo.releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
    desliz = null;
    delete cuerpo.dataset.deslizando;

    if (!activo) { resorteDesliz.hacia(0); return; }

    // Velocidad de los últimos ~90 ms: la del último evento suelto es ruido.
    const ahora = performance.now();
    const reciente = historial.filter((h) => ahora - h.t < 90);
    const primero = reciente[0] || historial[0] || { t: ahora, x: e.clientX };
    const ultimo = historial[historial.length - 1] || primero;
    const dt = Math.max(ultimo.t - primero.t, 1);
    const velocidad = ((ultimo.x - primero.x) / dt) * 1000;

    // A dónde iba el gesto si nadie lo parara. De ahí sale la decisión, no del
    // punto donde se levantó el dedo.
    const proyectado = dx + proyectar(velocidad);
    const i = indiceDelDia();
    const destino = proyectado < 0 ? i + 1 : i - 1;

    if (Math.abs(proyectado) < UMBRAL_DESLIZ || destino < 0 || destino >= viaje.dias.length) {
      resorteDesliz.hacia(0, velocidad * SEGUIMIENTO);
      return;
    }

    // El día nuevo entra por el lado del que tiraste. Si saliera por otro sitio,
    // el gesto y el resultado dejarían de ser la misma cosa.
    entradaPendiente = proyectado < 0 ? 1 : -1;
    ir(`#/v/${viaje.id}/d/${viaje.dias[destino].fecha}`);
  }

  cuerpo.addEventListener('pointerup', soltarDesliz);
  cuerpo.addEventListener('pointercancel', soltarDesliz);

  pintar();

  // --- Qué pasó con la bajada --------------------------------------------
  // Se dice solo cuando hay algo que decir. Sin nube configurada o sin sesión
  // es el funcionamiento normal y callarse es lo correcto; lo que no se puede
  // callar es que la nube estuviera y no contestara, porque entonces estás
  // viendo una copia que puede estar vieja y no tienes forma de saberlo.
  const origen = origenDe(viaje.id);
  if (origen === 'nube') {
    brindis(`Itinerario al día desde la nube · versión ${versionNubeDe(viaje.id)}`, { tipo: 'ok' });
  } else if (origen === 'fallo') {
    brindis('La nube no ha contestado. Estás viendo la copia del repositorio, que puede estar vieja.', { tipo: 'error', duracion: 7000 });
  } else if (origen === 'sin-fila' && nube.haySesion()) {
    brindis('Este viaje todavía no está en la nube. Publícalo desde la portada, tocando el título de arriba.', { tipo: 'info', duracion: 5000 });
  }

  return {
    viajeId: viaje.id,
    get titulo() { return viaje.titulo; },
    actualizar(nuevaRuta) {
      const antes = actual;
      actual = { ...nuevaRuta, fecha: nuevaRuta.fecha || actual.fecha || diaPorDefecto(viaje) };

      // Al cambiar de día o de pestaña, la barra de cambios sin guardar deja de
      // estar delante: en Transporte o en Listas no se pinta, y en otro día no
      // se ven las paradas que tocaste. Ese es justo el momento de decirlo, y
      // **una sola vez por tanda**: repetirlo en cada navegación lo convierte en
      // algo que se ignora, que es peor que no avisar.
      const cambioDeSitio = antes.fecha !== actual.fecha || antes.vista !== actual.vista;
      if (cambioDeSitio && viaje.pendientes && !avisadoDePendientes) {
        avisadoDePendientes = true;
        brindis(`Te dejas ${viaje.pendientes} cambio${viaje.pendientes === 1 ? '' : 's'} sin guardar en la nube. Están a salvo aquí; súbelos cuando quieras desde el itinerario.`,
          { tipo: 'info', duracion: 6000 });
      }
      pintar();
    },
    destruir() {
      resorteDesliz.parar();
      removeEventListener('keydown', alTeclado);
      quitarOyenteTema();
      buscador.cerrar();
      buscarLugar.cerrar();
      limpiarUrls();
      mapa.destruir();
    },
  };
}
