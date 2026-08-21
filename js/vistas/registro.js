/**
 * Portada: el registro de viajes.
 *
 * Es la mitad que convierte esto en una bitácora y no solo en la guía de un
 * viaje. Los viajes van del más reciente al más antiguo, y el que está en curso
 * se distingue de un vistazo.
 */

import { html, esc, icono, crudo } from '../ui/dom.js';
import { cargarRegistro } from '../datos.js';
import { estadoDe } from '../estado.js';
import { fechaLarga, diasEntre, aFecha, NOMBRE_MES } from '../horarios.js';
import { ESTADOS_VIAJE } from '../datos.js';

function rangoTexto(fechas) {
  const a = aFecha(fechas.inicio);
  const b = aFecha(fechas.fin);
  const mismoMes = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (mismoMes) return `${a.getDate()}–${b.getDate()} de ${NOMBRE_MES[b.getMonth()]} de ${b.getFullYear()}`;
  return `${a.getDate()} de ${NOMBRE_MES[a.getMonth()]} – ${b.getDate()} de ${NOMBRE_MES[b.getMonth()]} de ${b.getFullYear()}`;
}

function tarjeta(v, i) {
  const estado = ESTADOS_VIAJE[v.estadoReal] || ESTADOS_VIAJE.planificado;
  const noches = diasEntre(v.fechas.inicio, v.fechas.fin).length - 1;
  const guardado = estadoDe(v.id);
  const visitados = Object.keys(guardado.visitados).length;
  const notas = Object.keys(guardado.notas).length;

  return html`
    <a class="tarjeta-viaje" href="#/v/${v.id}" style="animation-delay:${i * 45}ms">
      <div class="tarjeta-viaje__estado">
        <span class="chip ${estado.clase}">${estado.etiqueta}</span>
        ${v.estadoReal === 'en-curso' ? crudo('<span class="menudo">Continuar</span>') : ''}
      </div>
      <div class="tarjeta-viaje__titulo">${v.titulo}</div>
      ${v.subtitulo ? crudo(`<div class="tarjeta-viaje__sub secundario">${esc(v.subtitulo)}</div>`) : ''}
      <div class="menudo" style="margin-top:var(--e3)">${rangoTexto(v.fechas)}</div>
      <div class="tarjeta-viaje__pie">
        <span class="tarjeta-viaje__cifra menudo"><b>${noches + 1}</b>días</span>
        <span class="tarjeta-viaje__cifra menudo"><b>${noches}</b>noches</span>
        ${visitados ? crudo(`<span class="tarjeta-viaje__cifra menudo"><b>${visitados}</b>visitados</span>`) : ''}
        ${notas ? crudo(`<span class="tarjeta-viaje__cifra menudo"><b>${notas}</b>notas</span>`) : ''}
      </div>
    </a>`;
}

export async function montarRegistro(raiz) {
  const registro = await cargarRegistro();

  raiz.className = 'registro scroll-y';
  raiz.innerHTML = html`
    <div class="registro__interior">
      <header style="display:flex;align-items:start;gap:var(--e4);margin-bottom:var(--e6)">
        <div style="flex:1;min-width:0">
          <h1 class="display">${registro.titulo || 'Bitácora'}</h1>
          <p class="secundario" style="margin-top:var(--e3);max-width:44ch">${registro.descripcion || ''}</p>
        </div>
        <a class="icono-boton" href="#/perfil" aria-label="Tus datos y tu cuenta" title="Tus datos">${icono('persona')}</a>
      </header>

      ${registro.viajes.length
        ? crudo(`<div class="registro__rejilla">${registro.viajes.map(tarjeta).join('')}</div>`)
        : html`<div class="vacio">
             ${icono('mapa')}
             <p class="secundario">Todavía no hay ningún viaje.</p>
             <p class="menudo" style="margin-top:8px">Se añaden con <code>node herramientas/nuevo-viaje.mjs</code>.</p>
           </div>`}

      <footer style="margin-top:var(--e8);padding-top:var(--e5);border-top:1px solid var(--borde)">
        <p class="menudo">
          Los datos de cada viaje están en <code>data/viajes/</code>. Lo visitado, las
          notas y las fotos viven solo en este navegador.
        </p>
      </footer>
    </div>`;

  return { destruir() {} };
}
