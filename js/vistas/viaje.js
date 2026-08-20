/**
 * Vista de un viaje: barra de días, panel y mapa, sincronizados en los dos
 * sentidos.
 *
 * Se monta una sola vez por viaje. Cambiar de día o abrir una ficha **no**
 * vuelve a crear el mapa: reconstruirlo en cada navegación haría parpadear las
 * teselas y perdería el encuadre, que es de las cosas que más delatan una web
 * hecha con prisa.
 */

import { html, esc, icono, crudo, $, $$, alPulsar } from '../ui/dom.js';
import { cargarViaje, diaPorDefecto, recuadroDe, INTENSIDADES, recomponer, viajeBase } from '../datos.js';
import { Mapa } from '../mapa.js';
import { crearHoja } from '../ui/hoja.js';
import { brindis } from '../ui/brindis.js';
import * as buscador from '../ui/buscador.js';
import * as buscarLugar from '../ui/buscar-lugar.js';
import { lugarDesdeBusqueda, claveEstable, nuevoId, ocultosDelDia, comoJsonDelViaje } from '../personalizacion.js';
import * as estado from '../estado.js';
import * as nube from '../nube.js';
import { esOscuro, alCambiarTema } from '../ui/tema.js';
import { aIso, aFecha, fechaLarga, CLAVES_DIA, NOMBRE_DIA } from '../horarios.js';
import { pintarDia, pintarFicha, pintarTransporte, pintarListas, pintarInfo } from './panel.js';

const PESTANAS = [
  { id: 'dia', etiqueta: 'Itinerario' },
  { id: 'transporte', etiqueta: 'Transporte' },
  { id: 'listas', etiqueta: 'Listas' },
  { id: 'info', etiqueta: 'Viaje' },
];

export async function montarViaje(raiz, ruta, { alTema }) {
  let viaje = await cargarViaje(ruta.viajeId);
  const nubeLista = await nube.configurada();
  let actual = { ...ruta, fecha: ruta.fecha || diaPorDefecto(viaje) };
  let verTodo = false;
  const urlsObjeto = new Set();

  raiz.className = '';
  raiz.innerHTML = html`
    <div class="app">
      <header class="cabecera">
        <a class="icono-boton" href="#/" aria-label="Volver al registro">${icono('atras')}</a>
        <div class="cabecera__marca">
          <span class="cabecera__logo">${viaje.titulo}</span>
          <span class="cabecera__contexto menudo">${viaje.subtitulo || ''}</span>
        </div>
        <div class="cabecera__acciones">
          <button type="button" class="icono-boton" data-accion="buscar" aria-label="Buscar (Ctrl+K)">${icono('buscar')}</button>
          <button type="button" class="icono-boton" data-accion="tema" aria-label="Cambiar tema">${icono('sol')}</button>
        </div>
      </header>

      <nav class="barra-dias" role="tablist" aria-label="Días del viaje"></nav>

      <div class="escenario">
        <section class="panel" aria-label="Itinerario">
          <div class="tirador" aria-hidden="true"></div>
          <div class="panel__pestanas" role="tablist" aria-label="Secciones">
            ${PESTANAS.map((p) => html`
              <button type="button" class="pestana" role="tab" data-pestana="${p.id}"
                      aria-selected="false">${p.etiqueta}</button>`)}
          </div>
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
  const margenInferior = () => (matchMedia('(max-width: 899px)').matches
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
  function pintarBarraDias() {
    const hoy = aIso(new Date());
    barraDias.innerHTML = viaje.dias.map((d) => {
      const f = aFecha(d.fecha);
      const puntos = (INTENSIDADES[d.intensidad] || INTENSIDADES.suave).puntos;
      return html`
        <button type="button" role="tab" class="dia-tab ${d.fecha === hoy ? 'dia-tab--hoy' : ''}"
                data-dia="${d.fecha}" aria-selected="${String(d.fecha === actual.fecha)}">
          <span class="dia-tab__dia">${NOMBRE_DIA[CLAVES_DIA[f.getDay()]].slice(0, 3)}</span>
          <span class="dia-tab__num">${f.getDate()}</span>
          <span class="dia-tab__pulso">${[1, 2, 3].map((n) => crudo(`<i class="${n <= puntos ? 'on' : ''}"></i>`))}</span>
        </button>`;
    }).join('');
    barraDias.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  function pintarPestanas() {
    const activa = actual.vista === 'lugar' ? 'dia' : actual.vista;
    $$('.pestana', raiz).forEach((p) => { p.setAttribute('aria-selected', String(p.dataset.pestana === activa)); });
    barraDias.classList.toggle('oculto', !(actual.vista === 'dia' || actual.vista === 'lugar'));
  }

  // --- Panel --------------------------------------------------------------
  function limpiarUrls() {
    for (const u of urlsObjeto) URL.revokeObjectURL(u);
    urlsObjeto.clear();
  }

  let primeraPintada = true;

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

  function pintarPanel({ moverFoco = true } = {}) {
    limpiarUrls();
    const guardado = estado.estadoDe(viaje.id);

    if (actual.vista === 'lugar') {
      const lugar = viaje.porId.get(actual.lugarId);
      if (!lugar) { ir(`#/v/${viaje.id}`); return; }
      // El bloque concreto de este día, para poder quitarlo desde su ficha.
      const diaActual = viaje.dias.find((d) => d.fecha === actual.fecha);
      const bloqueActual = diaActual?.bloques.find((b) => b.tipo === 'visita' && b.lugar?.id === lugar.id) || null;
      cuerpo.innerHTML = pintarFicha(viaje, lugar, guardado, { fecha: actual.fecha, bloqueActual });
      hidratarGaleria(lugar);
      if (moverFoco) situarFoco(lugar.nombre);
    } else if (actual.vista === 'transporte') {
      cuerpo.innerHTML = pintarTransporte(viaje);
      if (moverFoco) situarFoco('Transporte');
    } else if (actual.vista === 'listas') {
      cuerpo.innerHTML = pintarListas(viaje, guardado);
      if (moverFoco) situarFoco('Listas');
    } else if (actual.vista === 'info') {
      cuerpo.innerHTML = pintarInfo(viaje, {
        privados: estado.privadosDe(viaje.id),
        capa: estado.capaDe(viaje.id),
        nube: { configurada: nubeLista, usuario: nube.usuario() },
      });
      if (nubeLista && nube.haySesion()) {
        nube.comprobar().then((r) => {
          const n = $('[data-estado-nube]', cuerpo);
          if (n) n.textContent = r.motivo;
        });
      }
      mostrarOcupacion();
      if (moverFoco) situarFoco(`Información de ${viaje.titulo}`);
    } else {
      const dia = viaje.dias.find((d) => d.fecha === actual.fecha) || viaje.dias[0];
      const base = viajeBase(viaje.id);
      const ocultos = base ? ocultosDelDia(base, estado.capaDe(viaje.id), dia.fecha).length : 0;
      cuerpo.innerHTML = pintarDia(viaje, dia, guardado, { ocultos });
      if (moverFoco) situarFoco(`${dia.titulo}, ${fechaLarga(dia.fecha)}`);
    }
    cuerpo.scrollTop = 0;
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

  async function mostrarOcupacion() {
    const nodo = $('[data-ocupacion]', cuerpo);
    if (!nodo) return;
    const o = await estado.ocupacion();
    const n = await estado.contarFotos(viaje.id);
    if (!o) { nodo.textContent = `${n} foto(s) guardadas en este navegador.`; return; }
    nodo.textContent = `${n} foto(s) · ${(o.usado / 1048576).toFixed(1)} MB usados de ${(o.total / 1048576).toFixed(0)} MB disponibles.`;
  }

  // --- Mapa por vista -----------------------------------------------------
  function refrescarMapa() {
    const visitados = estado.estadoDe(viaje.id).visitados;
    if (verTodo) { mapa.mostrarTodo(viaje, { visitados }); }
    else {
      const dia = viaje.dias.find((d) => d.fecha === actual.fecha) || viaje.dias[0];
      mapa.mostrarDia(dia, { visitados });
    }
    if (actual.vista === 'lugar') mapa.irA(actual.lugarId, { abrirGlobo: false });
  }

  // --- Render completo ----------------------------------------------------
  let diaPintado = null;
  let modoPintado = null;

  function pintar() {
    pintarBarraDias();
    pintarPestanas();
    pintarPanel();

    const modo = verTodo ? 'todo' : `dia:${actual.fecha}`;
    if (modo !== modoPintado) { refrescarMapa(); modoPintado = modo; diaPintado = actual.fecha; }
    else if (actual.vista === 'lugar') mapa.irA(actual.lugarId, { abrirGlobo: false });
    else mapa.destacar(null);
  }

  // --- Eventos ------------------------------------------------------------
  alPulsar(raiz, '[data-accion="tema"]', alTema);
  alPulsar(raiz, '[data-accion="buscar"]', () => abrirBuscador());

  alPulsar(barraDias, '[data-dia]', (b) => {
    verTodo = false;
    $('[data-mapa-accion="todo"]', raiz)?.setAttribute('aria-pressed', 'false');
    ir(`#/v/${viaje.id}/d/${b.dataset.dia}`);
  });

  alPulsar(raiz, '.pestana', (b) => {
    const p = b.dataset.pestana;
    ir(p === 'dia' ? `#/v/${viaje.id}/d/${actual.fecha}` : `#/v/${viaje.id}/${p}`);
  });

  alPulsar(cuerpo, '.bloque__principal', (b) => {
    const bloque = b.closest('.bloque--visita');
    if (!bloque) return;
    hoja.asomar();
    ir(`#/v/${viaje.id}/l/${bloque.dataset.lugar}?d=${actual.fecha}`);
  });

  alPulsar(cuerpo, '[data-accion="atras"]', () => ir(`#/v/${viaje.id}/d/${actual.fecha}`));
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
    const seccion = b.closest('.panel__seccion');
    const total = $$('[data-tarea]', seccion).length;
    const hechas = $$('[data-tarea][aria-checked="true"]', seccion).length;
    $('.progreso-lista__valor', seccion).style.width = `${Math.round((hechas / total) * 100)}%`;
    $('.progreso-lista .menudo', seccion).textContent = `${hechas}/${total}`;
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
        brindis(`${archivos.length} foto(s) guardadas`, { tipo: 'ok' });
      } catch (err) {
        brindis(`No se ha podido guardar: ${err.message}`, { tipo: 'error', duracion: 5000 });
      }
      e.target.value = '';
    } else if (campo === 'importar') {
      const archivo = e.target.files?.[0];
      if (!archivo) return;
      try {
        const resultado = await estado.importar(JSON.parse(await archivo.text()));
        brindis(`Importado: ${resultado.notas} nota(s), ${resultado.fotos} foto(s) y ${resultado.paradas} parada(s) propias`, { tipo: 'ok', duracion: 5000 });
        trasCambiarCapa();
      } catch (err) {
        brindis(err.message, { tipo: 'error', duracion: 5000 });
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

  alPulsar(cuerpo, '[data-accion="entrar-nube"]', async () => {
    const correo = $('[data-correo-nube]', cuerpo)?.value.trim();
    if (!correo || !correo.includes('@')) { brindis('Escribe un correo válido', { tipo: 'error' }); return; }
    try {
      await nube.pedirAcceso(correo);
      brindis('Enlace enviado. Ábrelo en este dispositivo.', { tipo: 'ok', duracion: 7000 });
    } catch (e) {
      brindis(e.message, { tipo: 'error', duracion: 5000 });
    }
  });

  alPulsar(cuerpo, '[data-accion="salir-nube"]', async () => {
    await nube.salir();
    pintarPanel({ moverFoco: false });
    brindis('Sesión cerrada. Tus datos siguen en este navegador.');
  });

  alPulsar(cuerpo, '[data-accion="sincronizar"]', async () => {
    try {
      // Lo personal sube; el viaje se lee de la nube si está más adelantado.
      await nube.guardarEstado(viaje.id, estado.estadoDe(viaje.id));
      const remoto = await nube.leerViaje(viaje.id);
      brindis(remoto
        ? `Sincronizado. El viaje está en la nube (versión ${remoto.versionNube}).`
        : 'Tu estado ha subido. El viaje todavía no está en la nube.', { tipo: 'ok', duracion: 5000 });
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
    if (!confirm(`Se van a deshacer ${total} cambio(s) del itinerario. Las notas, las fotos y lo visitado no se tocan.`)) return;
    estado.guardarCapa(viaje.id, { version: 1, lugares: [], bloques: [], ocultos: [] });
    trasCambiarCapa('Itinerario devuelto a como estaba');
  });

  alPulsar(cuerpo, '[data-accion="exportar"]', async () => {
    const paquete = await estado.exportar(viaje.id);
    const blob = new Blob([JSON.stringify(paquete, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bitacora-${viaje.id}-${aIso(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    brindis('Recuerdos exportados', { tipo: 'ok' });
  });

  alPulsar(cuerpo, '[data-accion="anadir-privado"]', () => {
    const clave = prompt('¿Qué dato? (por ejemplo: Dirección, Reserva, Teléfono)');
    if (!clave) return;
    const valor = prompt(`Valor de "${clave}"`);
    if (!valor) return;
    const datos = estado.privadosDe(viaje.id);
    datos.campos.push({ clave, valor });
    estado.guardarPrivados(viaje.id, datos);
    pintarPanel();
    brindis('Guardado solo en este navegador', { tipo: 'ok' });
  });

  alPulsar(cuerpo, '[data-quitar-privado]', (b) => {
    const datos = estado.privadosDe(viaje.id);
    datos.campos.splice(Number(b.dataset.quitarPrivado), 1);
    estado.guardarPrivados(viaje.id, datos);
    pintarPanel();
  });

  // --- Añadir y quitar paradas del itinerario -----------------------------
  /**
   * Rehace el viaje con la capa nueva y repinta.
   *
   * Se recompone desde el JSON crudo que ya está en memoria: no se vuelve a
   * pedir nada a la red, así que añadir una parada funciona igual sin cobertura.
   */
  function trasCambiarCapa(mensaje) {
    const rehecho = recomponer(viaje.id, { archivo: null });
    if (rehecho) viaje = rehecho;
    modoPintado = null;
    pintar();
    if (mensaje) brindis(mensaje, { tipo: 'ok' });
  }

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
    const dia = viaje.dias.find((d) => d.fecha === actual.fecha) || viaje.dias[0];
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
      const clave = claveEstable(actual.fecha, {
        lugar: bloque.lugar?.id, desde: bloque.desde, hasta: bloque.hasta,
        titulo: bloque.titulo, inicio: bloque.inicio, tipo: bloque.tipo,
      });
      if (!capa.ocultos.includes(clave)) capa.ocultos.push(clave);
    }
    estado.guardarCapa(viaje.id, capa);
    ir(`#/v/${viaje.id}/d/${actual.fecha}`);
    trasCambiarCapa('Quitado del itinerario');
  });

  alPulsar(cuerpo, '[data-accion="restaurar"]', () => {
    const capa = estado.capaDe(viaje.id);
    const base = viajeBase(viaje.id);
    const delDia = new Set(ocultosDelDia(base, capa, actual.fecha)
      .map((b) => claveEstable(actual.fecha, b)));
    capa.ocultos = capa.ocultos.filter((c) => !delDia.has(c));
    estado.guardarCapa(viaje.id, capa);
    trasCambiarCapa(`${delDia.size} parada(s) restaurada(s)`);
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
    const dia = viaje.dias.find((d) => d.fecha === actual.fecha) || viaje.dias[0];
    const lugares = verTodo ? viaje.lugaresUsados : dia.paradas.map((p) => p.lugar);
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
      if (r.tipo === 'lugar') { hoja.asomar(); ir(`#/v/${viaje.id}/l/${r.id}?d=${actual.fecha}`); }
      else ir(`#/v/${viaje.id}/d/${r.id}`);
    });
  }

  function alTeclado(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrirBuscador(); return; }
    if (buscador.abierto()) return;
    if (e.target.matches?.('input, textarea')) return;

    const i = viaje.dias.findIndex((d) => d.fecha === actual.fecha);
    if (e.key === 'ArrowRight' && i < viaje.dias.length - 1) ir(`#/v/${viaje.id}/d/${viaje.dias[i + 1].fecha}`);
    else if (e.key === 'ArrowLeft' && i > 0) ir(`#/v/${viaje.id}/d/${viaje.dias[i - 1].fecha}`);
    else if (e.key === 'Escape' && actual.vista === 'lugar') ir(`#/v/${viaje.id}/d/${actual.fecha}`);
  }
  addEventListener('keydown', alTeclado);

  pintar();

  return {
    viajeId: viaje.id,
    actualizar(nuevaRuta) {
      actual = { ...nuevaRuta, fecha: nuevaRuta.fecha || actual.fecha || diaPorDefecto(viaje) };
      pintar();
    },
    destruir() {
      removeEventListener('keydown', alTeclado);
      quitarOyenteTema();
      buscador.cerrar();
      buscarLugar.cerrar();
      limpiarUrls();
      mapa.destruir();
    },
  };
}
