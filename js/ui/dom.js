/**
 * Utilidades de DOM y texto. Sin dependencias.
 */

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

/**
 * HTML ya montado.
 *
 * Es una clase y no un texto suelto porque `html` tiene que poder distinguir
 * «texto del usuario, escápalo» de «HTML que yo mismo he construido, déjalo
 * pasar». Con marcadores de texto plano, una plantilla anidada dentro de otra
 * se escapaba y el navegador pintaba el `<button>` como si fuera prosa.
 *
 * `toString()` hace que funcione tal cual en `innerHTML`, en `join('')` y en
 * cualquier concatenación, sin tener que envolverla en ningún sitio.
 */
export class Crudo {
  constructor(texto) { this.texto = String(texto); }
  toString() { return this.texto; }
}

export const crudo = (s) => new Crudo(s);

/**
 * `false`, `null` y `undefined` no pintan nada, que es lo que hace que
 * `${condicion && html`...`}` funcione. **Un booleano suelto tampoco pinta**,
 * así que para un atributo tipo `aria-pressed="${x}"` hay que escribir
 * `String(x)` — si no, sale vacío y el atributo deja de significar nada.
 */
function pintar(v) {
  if (v == null || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(pintar).join('');
  if (v instanceof Crudo) return v.texto;
  return esc(v);
}

/**
 * Plantilla que escapa por defecto: todo lo que entre por ${} va escapado salvo
 * que sea Crudo — es decir, salvo que venga de `crudo()`, de `icono()` o de otra
 * llamada a `html`.
 */
export function html(partes, ...valores) {
  let salida = partes[0];
  for (let i = 0; i < valores.length; i += 1) salida += pintar(valores[i]) + partes[i + 1];
  return new Crudo(salida);
}

/** <svg><use href="#i-nombre"></svg> contra el juego de iconos de index.html. */
export const icono = (nombre, clase = '') =>
  crudo(`<svg class="${esc(clase)}" aria-hidden="true"><use href="#i-${esc(nombre)}"/></svg>`);

export const $  = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

/**
 * Markdown mínimo: párrafos, **negrita**, *cursiva*, `código` y listas con guion.
 * Se escapa primero y se marca después, así que no hay forma de colar HTML.
 */
export function md(texto) {
  if (!texto) return '';
  const enLinea = (s) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  const bloques = String(texto).split(/\n{2,}/);
  return bloques
    .map((bloque) => {
      const lineas = bloque.split('\n');
      if (lineas.every((l) => /^\s*-\s+/.test(l))) {
        const items = lineas.map((l) => `<li>${enLinea(l.replace(/^\s*-\s+/, ''))}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      return `<p>${lineas.map(enLinea).join('<br>')}</p>`;
    })
    .join('');
}

/** "1 h 45 min" a partir de minutos. */
export function duracionTexto(min) {
  if (!min || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * La misma duración, apretada: "1h38", "35min".
 * La columna de tiempo de la cronología mide 46 px y "1 h 38 min" se parte en
 * dos líneas, que descuadra la fila entera contra su punto del raíl.
 */
export function duracionCorta(min) {
  if (!min || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/**
 * "1 nota", "3 notas", "0 notas".
 *
 * En español el plural es regular casi siempre, así que basta con la forma en
 * singular y una `s`. Cuando no lo sea —«mes» / «meses»— se pasa el plural
 * entero como tercer argumento.
 *
 * Existe porque «3 nota(s)» es lo que escribe un programa, no lo que escribe
 * alguien, y esto lo lee Yixuan de pie en una plaza.
 */
export const plural = (n, singular, muchos = `${singular}s`) =>
  `${n} ${n === 1 ? singular : muchos}`;

/** Importe con la moneda del viaje. */
export function dinero(importe, moneda = 'EUR') {
  if (importe === 0) return 'Gratis';
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(importe);
  } catch {
    return `${importe} ${moneda}`;
  }
}

/** Delegación de eventos: un solo escuchador por contenedor. */
export function alPulsar(raiz, selector, manejador) {
  raiz.addEventListener('click', (e) => {
    const objetivo = e.target.closest(selector);
    if (objetivo && raiz.contains(objetivo)) manejador(objetivo, e);
  });
}

/**
 * Muelle críticamente amortiguado sobre requestAnimationFrame.
 * Se usa para la hoja arrastrable: a diferencia de una transición de CSS, se
 * puede reorientar en marcha conservando la velocidad, que es justo lo que hace
 * falta cuando alguien agarra un panel que ya se estaba moviendo.
 *
 * @param {(v:number)=>void} alActualizar
 */
export function muelle(alActualizar, { rigidez = 170, amortiguacion = 26 } = {}) {
  let valor = 0;
  let destino = 0;
  let velocidad = 0;
  let corriendo = false;
  let ultimo = 0;

  function paso(ahora) {
    if (!corriendo) return;
    const dt = Math.min((ahora - ultimo) / 1000, 1 / 30);
    ultimo = ahora;

    const fuerza = -rigidez * (valor - destino) - amortiguacion * velocidad;
    velocidad += fuerza * dt;
    valor += velocidad * dt;

    if (Math.abs(valor - destino) < 0.35 && Math.abs(velocidad) < 0.35) {
      valor = destino;
      velocidad = 0;
      corriendo = false;
      alActualizar(valor);
      return;
    }
    alActualizar(valor);
    requestAnimationFrame(paso);
  }

  return {
    get valor() { return valor; },
    get velocidad() { return velocidad; },
    fijar(v) { valor = v; destino = v; velocidad = 0; corriendo = false; alActualizar(v); },
    situar(v) { valor = v; alActualizar(v); },
    /** Nuevo destino conservando la velocidad actual: sin salto ni frenazo. */
    hacia(v, velocidadInicial = velocidad) {
      destino = v;
      velocidad = velocidadInicial;
      if (!corriendo) {
        corriendo = true;
        ultimo = performance.now();
        requestAnimationFrame(paso);
      }
    },
    parar() { corriendo = false; velocidad = 0; },
  };
}

/**
 * Proyección de inercia de Apple (Designing Fluid Interfaces).
 * Dice dónde acabaría el elemento si se soltara con esta velocidad, para poder
 * elegir el punto de anclaje al que va **de verdad** y no al más cercano al dedo.
 */
export function proyectar(velocidadPxs, deceleracion = 0.998) {
  return ((velocidadPxs / 1000) * deceleracion) / (1 - deceleracion);
}

/** Resistencia progresiva al pasarse de un borde. Nada se para en seco. */
export function gomaElastica(exceso, dimension, constante = 0.55) {
  return (exceso * dimension * constante) / (dimension + constante * Math.abs(exceso));
}
