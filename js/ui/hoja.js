/**
 * Hoja inferior arrastrable (móvil).
 *
 * Es la pieza que decide si esto se siente bien o no, así que va con todo:
 *
 *  · Respuesta en pointer-down, no al soltar.
 *  · Seguimiento 1:1 respetando por dónde se agarró. Saltar al centro del
 *    elemento al agarrarlo rompe la ilusión al instante.
 *  · Historial de velocidad y **proyección de inercia**: al soltar no se va al
 *    punto más cercano al dedo, sino al más cercano a donde el gesto *iba*.
 *    Es lo que hace que un golpe seco lance la hoja en vez de dejarla a medias.
 *  · Muelle en rAF en lugar de transición CSS, porque una transición no se
 *    puede agarrar a mitad: el muelle arranca del valor que hay en pantalla y
 *    hereda la velocidad, así que se puede reorientar sin frenazo.
 *  · Goma elástica en los topes. Nada en el mundo real se para en seco.
 *  · Un solo dedo: los toques posteriores se ignoran o la hoja pega un salto.
 */

import { muelle, proyectar, gomaElastica } from './dom.js';

const ASOMA = 132;          // px visibles cuando está colapsada
const HISTERESIS = 8;       // px antes de dar por empezado el arrastre
const VEL_DECISIVA = 420;   // px/s: por encima de esto manda el gesto, no la posición

export function crearHoja(panel, { tirador, cuerpo, alCambiar = () => {} } = {}) {
  const consulta = matchMedia('(max-width: 899px)');
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');

  let activa = false;
  let posicion = 'media';
  let anclajes = { completa: 0, media: 0, colapsada: 0 };

  const resorte = muelle((v) => {
    panel.style.transform = `translate3d(0, ${v}px, 0)`;
  });

  function medir() {
    const alto = panel.getBoundingClientRect().height || 1;
    anclajes = {
      completa: 0,
      media: Math.round(alto * 0.52),
      colapsada: Math.max(0, Math.round(alto - ASOMA)),
    };
  }

  function irA(nombre, velocidad = 0) {
    if (!activa) return;
    medir();
    const destino = anclajes[nombre] ?? anclajes.media;
    if (posicion !== nombre) { posicion = nombre; alCambiar(nombre); }
    panel.dataset.posicion = nombre;
    if (sinMovimiento.matches) resorte.fijar(destino);
    else resorte.hacia(destino, velocidad);
  }

  function anclajeMasCercano(y) {
    return Object.entries(anclajes)
      .sort((a, b) => Math.abs(a[1] - y) - Math.abs(b[1] - y))[0][0];
  }

  // --- Arrastre -----------------------------------------------------------
  // Solo se arrastra desde el tirador. Arrastrar también desde el cuerpo obliga
  // a pelearse con el scroll nativo de la lista, y esa pelea siempre la acaba
  // perdiendo alguien: o el itinerario no se puede recorrer con el dedo, o la
  // hoja no se puede cerrar. El tirador es explícito y no compite con nada.
  let idPuntero = null;
  let yInicial = 0;
  let desplazamientoInicial = 0;
  let comprometido = false;
  let huboArrastre = false;
  let historial = [];

  function alBajar(e) {
    if (!activa || idPuntero !== null) return;              // un solo dedo
    if (e.button != null && e.button !== 0) return;

    idPuntero = e.pointerId;
    yInicial = e.clientY;
    desplazamientoInicial = resorte.valor;
    comprometido = false;
    huboArrastre = false;
    historial = [{ t: performance.now(), y: e.clientY }];
    resorte.parar();
    // La captura va **aquí**, no después de la histéresis: el tirador mide unos
    // 28 px y el primer movimiento ya saca el puntero de él. Capturando más
    // tarde, el gesto se perdía en cuanto empezaba.
    try { tirador.setPointerCapture(e.pointerId); } catch { /* sin captura se sigue */ }
  }

  function alMover(e) {
    if (e.pointerId !== idPuntero) return;
    const delta = e.clientY - yInicial;

    if (!comprometido) {
      if (Math.abs(delta) < HISTERESIS) return;
      comprometido = true;
      huboArrastre = true;
      panel.dataset.arrastrando = 'true';
    }

    historial.push({ t: performance.now(), y: e.clientY });
    if (historial.length > 6) historial.shift();

    let y = desplazamientoInicial + delta;
    const alto = panel.getBoundingClientRect().height || 1;
    if (y < anclajes.completa) y = anclajes.completa - gomaElastica(anclajes.completa - y, alto);
    else if (y > anclajes.colapsada) y = anclajes.colapsada + gomaElastica(y - anclajes.colapsada, alto);

    resorte.situar(y);
    e.preventDefault();
  }

  function alSoltar(e) {
    if (e.pointerId !== idPuntero) return;
    idPuntero = null;
    try { tirador.releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
    delete panel.dataset.arrastrando;
    if (!comprometido) return;
    comprometido = false;

    // Velocidad de los últimos ~80 ms: la instantánea del último evento es ruido.
    const ahora = performance.now();
    const reciente = historial.filter((p) => ahora - p.t < 90);
    const primero = reciente[0] || historial[0];
    const ultimo = historial[historial.length - 1];
    const dt = Math.max(ultimo.t - primero.t, 1);
    const velocidad = ((ultimo.y - primero.y) / dt) * 1000;

    // A dónde iría el gesto si nadie lo parara. De ahí sale el anclaje, no del
    // punto donde se levantó el dedo.
    const proyectado = resorte.valor + (Math.abs(velocidad) > VEL_DECISIVA ? proyectar(velocidad) : 0);
    irA(anclajeMasCercano(proyectado), velocidad);
  }

  function alCancelar(e) {
    if (e.pointerId !== idPuntero) return;
    idPuntero = null;
    comprometido = false;
    delete panel.dataset.arrastrando;
    irA(anclajeMasCercano(resorte.valor));
  }

  tirador.addEventListener('pointerdown', alBajar);
  tirador.addEventListener('pointermove', alMover, { passive: false });
  tirador.addEventListener('pointerup', alSoltar);
  tirador.addEventListener('pointercancel', alCancelar);

  // Pulsar el tirador alterna entre completa y media: es lo que espera el pulgar.
  // Tras un arrastre el navegador dispara igualmente un click, y sin este
  // guardián ese click deshacía el gesto que se acababa de hacer.
  tirador.addEventListener('click', () => {
    if (!activa || huboArrastre) { huboArrastre = false; return; }
    irA(posicion === 'completa' ? 'media' : 'completa');
  });

  // --- Activación por tamaño de pantalla ----------------------------------
  function sincronizar() {
    const debeEstar = consulta.matches;
    if (debeEstar === activa) { if (activa) { medir(); resorte.fijar(anclajes[posicion]); } return; }
    activa = debeEstar;
    if (activa) {
      medir();
      resorte.fijar(anclajes[posicion]);
    } else {
      panel.style.transform = '';
      delete panel.dataset.posicion;
    }
  }

  consulta.addEventListener('change', sincronizar);
  addEventListener('resize', () => { if (activa) { medir(); resorte.fijar(anclajes[posicion]); } });
  sincronizar();

  return {
    get activa() { return activa; },
    get posicion() { return posicion; },
    ir: irA,
    /** Sube a media si estaba colapsada. Se usa al abrir una ficha desde el mapa. */
    asomar() { if (activa && posicion === 'colapsada') irA('media'); },
    sincronizar,
  };
}
