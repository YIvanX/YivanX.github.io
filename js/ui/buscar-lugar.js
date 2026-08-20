/**
 * Buscador de sitios sobre el mapa, para añadir paradas al itinerario.
 *
 * **Photon** (komoot) como buscador principal: está hecho precisamente para
 * autocompletar, acepta sesgo por coordenadas y manda `Access-Control-Allow-Origin: *`,
 * así que se puede llamar desde el navegador sin clave ni intermediario.
 * **Nominatim** queda de reserva por si Photon no responde.
 *
 * Google Places queda descartado y conviene saber por qué: exige clave de API y
 * facturación, y una clave metida en un sitio estático y público es una clave
 * regalada. Los datos son de OpenStreetMap, los mismos que ya usa el mapa.
 *
 * **El sesgo de ubicación no es un adorno.** Buscando «catedral» sin él, el
 * primer resultado es la catedral de León de México. Con el centro del viaje
 * como sesgo, sale la de León, España, y después Astorga.
 */

import { html, esc, icono, crudo, $, $$ } from './dom.js';
import { CATEGORIAS } from '../datos.js';
import { categoriaDesdeOsm } from '../personalizacion.js';

const PHOTON = 'https://photon.komoot.io/api/';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const ESPERA_TECLEO = 450;   // ms sin teclear antes de preguntar

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Nombre legible de un resultado de Photon, que reparte los datos en muchos campos. */
function describir(p) {
  const nombre = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || p.city || p.county || 'Sin nombre';
  const zona = [p.city || p.town || p.village || p.county, p.state, p.country].filter(Boolean).join(' · ');
  return { nombre, zona };
}

async function buscarPhoton(consulta, centro, senal) {
  const u = new URL(PHOTON);
  u.searchParams.set('q', consulta);
  u.searchParams.set('limit', '8');
  if (centro) { u.searchParams.set('lat', centro[0]); u.searchParams.set('lon', centro[1]); }
  const res = await fetch(u, { signal: senal });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const d = await res.json();
  return (d.features || []).map((f) => {
    const { nombre, zona } = describir(f.properties);
    const [lon, lat] = f.geometry.coordinates;
    return {
      nombre,
      zona,
      coords: [lat, lon],
      osm: { clave: f.properties.osm_key, valor: f.properties.osm_value },
      fuente: 'Photon · OpenStreetMap',
    };
  });
}

async function buscarNominatim(consulta, centro, senal) {
  const u = new URL(NOMINATIM);
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('limit', '8');
  u.searchParams.set('q', consulta);
  if (centro) {
    const [la, lo] = centro;
    u.searchParams.set('viewbox', `${lo - 1.5},${la + 1.5},${lo + 1.5},${la - 1.5}`);
  }
  const res = await fetch(u, { signal: senal });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const d = await res.json();
  return d.map((x) => ({
    nombre: x.name || x.display_name.split(',')[0],
    zona: x.display_name.split(',').slice(1, 4).join(' ·').trim(),
    coords: [Number(x.lat), Number(x.lon)],
    osm: { clave: x.category, valor: x.type },
    fuente: 'Nominatim · OpenStreetMap',
  }));
}

/** Busca, con Nominatim de reserva si Photon falla. */
export async function buscar(consulta, centro, senal) {
  if (!consulta || consulta.trim().length < 3) return [];
  try {
    return await buscarPhoton(consulta.trim(), centro, senal);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    console.warn('Photon no responde, se prueba Nominatim:', e.message);
    return buscarNominatim(consulta.trim(), centro, senal);
  }
}

// --- Diálogo --------------------------------------------------------------

let fondo = null;
let controlador = null;

export const abierto = () => Boolean(fondo);

export function cerrar() {
  controlador?.abort();
  controlador = null;
  fondo?.remove();
  fondo = null;
}

/**
 * Abre el diálogo para añadir una parada.
 *
 * @param {{dia:object, centro:[number,number], alElegirEnMapa:Function, alGuardar:Function}} opciones
 */
export function abrirAnadir({ dia, centro, alElegirEnMapa, alGuardar }) {
  if (fondo) cerrar();

  let elegido = null;
  let resultados = [];

  fondo = document.createElement('div');
  fondo.className = 'buscador-fondo';
  fondo.innerHTML = html`
    <div class="anadir" role="dialog" aria-modal="true" aria-labelledby="anadir-titulo">
      <div class="anadir__cabecera">
        <h2 class="titulo-2" id="anadir-titulo">Añadir una parada</h2>
        <button type="button" class="icono-boton" data-cerrar aria-label="Cerrar">${icono('cerrar')}</button>
      </div>

      <div class="buscador__campo">
        ${icono('buscar')}
        <input type="search" data-consulta placeholder="Buscar un sitio…" autocomplete="off" spellcheck="false"
               aria-label="Buscar un sitio en el mapa">
      </div>

      <div class="anadir__resultados scroll-y" data-resultados>
        <p class="anadir__pista menudo">
          Escribe el nombre de un sitio, o elígelo tocando el mapa si no sabes cómo se llama.
        </p>
      </div>

      <div class="anadir__forma oculto" data-forma>
        <div class="anadir__elegido">
          <span class="titulo-3" data-nombre></span>
          <span class="menudo" data-zona></span>
        </div>
        <div class="anadir__campos">
          <label class="campo">
            <span class="etiqueta">Hora</span>
            <input type="time" data-inicio value="12:00" required>
          </label>
          <label class="campo">
            <span class="etiqueta">Hasta</span>
            <input type="time" data-fin>
          </label>
          <label class="campo campo--ancho">
            <span class="etiqueta">Categoría</span>
            <select data-categoria>
              ${Object.entries(CATEGORIAS).map(([k, v]) => html`<option value="${k}">${v.etiqueta}</option>`)}
            </select>
          </label>
          <label class="campo campo--ancho">
            <span class="etiqueta">Nota</span>
            <input type="text" data-nota placeholder="Opcional: por qué vais, qué mirar…" maxlength="200">
          </label>
        </div>
      </div>

      <div class="anadir__pie">
        <button type="button" class="boton" data-mapa>${icono('pin')}Elegir en el mapa</button>
        <button type="button" class="boton boton--principal" data-guardar disabled>${icono('mas')}Añadir al día</button>
      </div>
    </div>`;

  document.body.appendChild(fondo);

  const campo = $('[data-consulta]', fondo);
  const caja = $('[data-resultados]', fondo);
  const forma = $('[data-forma]', fondo);
  const guardar = $('[data-guardar]', fondo);

  function pintarResultados(lista, mensaje) {
    if (mensaje) { caja.innerHTML = html`<p class="anadir__pista menudo">${mensaje}</p>`; return; }
    if (!lista.length) { caja.innerHTML = html`<p class="anadir__pista menudo">Nada encontrado. Prueba con otro nombre.</p>`; return; }
    caja.innerHTML = lista.map((r, i) => {
      const cat = CATEGORIAS[categoriaDesdeOsm(r.osm?.clave, r.osm?.valor)] || CATEGORIAS.practico;
      return html`
        <button type="button" class="anadir__resultado" data-i="${i}">
          ${icono(cat.icono)}
          <span>
            <span class="titulo-3">${r.nombre}</span>
            <span class="menudo" style="display:block">${r.zona}</span>
          </span>
        </button>`;
    }).join('');
  }

  function elegir(r) {
    elegido = r;
    forma.classList.remove('oculto');
    $('[data-nombre]', fondo).textContent = r.nombre;
    $('[data-zona]', fondo).textContent = r.zona || `${r.coords[0]}, ${r.coords[1]}`;
    $('[data-categoria]', fondo).value = categoriaDesdeOsm(r.osm?.clave, r.osm?.valor);
    guardar.disabled = false;
    $$('.anadir__resultado', fondo).forEach((b) => b.removeAttribute('data-sel'));
    forma.scrollIntoView({ block: 'nearest' });
  }

  let temporizador = null;
  campo.addEventListener('input', () => {
    clearTimeout(temporizador);
    controlador?.abort();
    const consulta = campo.value.trim();
    if (consulta.length < 3) { pintarResultados([], 'Escribe al menos tres letras.'); return; }
    pintarResultados([], 'Buscando…');
    // Se espera a que pare de teclear: una petición por letra es maltratar un
    // servicio gratuito, y además llena la lista de resultados a medias.
    temporizador = setTimeout(async () => {
      controlador = new AbortController();
      try {
        resultados = await buscar(consulta, centro, controlador.signal);
        pintarResultados(resultados);
      } catch (e) {
        if (e.name === 'AbortError') return;
        pintarResultados([], navigator.onLine
          ? `No se ha podido buscar: ${e.message}`
          : 'Sin conexión. Puedes elegir el sitio tocando el mapa.');
      }
    }, ESPERA_TECLEO);
  });

  fondo.addEventListener('click', (e) => {
    if (e.target === fondo || e.target.closest('[data-cerrar]')) { cerrar(); return; }
    const res = e.target.closest('.anadir__resultado');
    if (res) { elegir(resultados[Number(res.dataset.i)]); return; }
    if (e.target.closest('[data-mapa]')) {
      cerrar();
      alElegirEnMapa();
      return;
    }
    if (e.target.closest('[data-guardar]') && elegido) {
      const inicio = $('[data-inicio]', fondo).value;
      if (!inicio) { $('[data-inicio]', fondo).focus(); return; }
      const datos = {
        resultado: { ...elegido, categoria: $('[data-categoria]', fondo).value },
        fecha: dia.fecha,
        inicio,
        fin: $('[data-fin]', fondo).value || null,
        nota: $('[data-nota]', fondo).value.trim() || null,
      };
      cerrar();
      alGuardar(datos);
    }
  });

  fondo.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
  campo.focus();

  /** Se llama desde fuera cuando el usuario ha tocado un punto del mapa. */
  return {
    conPunto(coords, nombre) {
      elegir({ nombre: nombre || 'Punto elegido en el mapa', zona: `${coords[0]}, ${coords[1]}`, coords, fuente: 'Elegido en el mapa' });
    },
  };
}
