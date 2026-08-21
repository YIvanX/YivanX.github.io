/**
 * Tus datos: la cuenta y todo lo que es tuyo y no del viaje.
 *
 * Todo esto vivía dentro del viaje, mezclado con el presupuesto y los créditos
 * de las fotos. El corte es el motivo de que exista esta pantalla:
 *
 *   · **El viaje** es lo público — sale del JSON del repositorio y lo ve igual
 *     cualquiera con quien lo compartas: días, avisos, presupuesto, transporte.
 *   · **Tus datos** es lo privado — vive solo en este navegador y no sube nunca:
 *     la dirección del alojamiento, las referencias de reserva, tus notas, tus
 *     fotos, y quién eres para la nube.
 *
 * Por eso los datos privados están aquí y no en el viaje: el repositorio es
 * público y un itinerario ya dice qué días no hay nadie en casa; la dirección
 * exacta no puede vivir al lado.
 *
 * Lo que ocupa el navegador también se mide aquí: `navigator.storage.estimate()`
 * es del origen entero, no de un viaje, y decirlo dentro de uno era mentir por
 * encuadre.
 */

import { html, esc, icono, crudo, plural, $, $$, alPulsar } from '../ui/dom.js';
import { brindis } from '../ui/brindis.js';
import { cargarRegistro } from '../datos.js';
import { fijarTema, preferenciaActual } from '../ui/tema.js';
import * as nube from '../nube.js';
import * as estado from '../estado.js';

const TEMAS = [
  { id: 'auto', etiqueta: 'Automático', icono: 'capas', pista: 'Sigue al sistema' },
  { id: 'claro', etiqueta: 'Claro', icono: 'sol', pista: '' },
  { id: 'oscuro', etiqueta: 'Oscuro', icono: 'luna', pista: '' },
];

function tarjetaDeViaje(v) {
  const privados = estado.privadosDe(v.id);
  const guardado = estado.estadoDe(v.id);
  const notas = Object.keys(guardado.notas).length;
  const visitados = Object.keys(guardado.visitados).length;

  // Solo se enseña lo que tiene algo. Una fila de ceros no informa de nada y
  // hace más difícil ver el número que sí importa.
  const cuentas = [
    privados.campos.length && plural(privados.campos.length, 'dato privado', 'datos privados'),
    notas && plural(notas, 'nota'),
    visitados && plural(visitados, 'sitio visitado', 'sitios visitados'),
  ].filter(Boolean);

  return html`
    <section class="tarjeta-datos" data-viaje="${v.id}">
      <div class="tarjeta-datos__cabecera">
        <div style="min-width:0">
          <a class="titulo-3 tarjeta-datos__nombre" href="#/v/${v.id}">
            ${v.titulo}${icono('adelante')}
          </a>
          <p class="menudo" style="margin-top:2px" data-cuentas>
            ${cuentas.length ? cuentas.join(' · ') : 'Todavía no has guardado nada de este viaje'}
          </p>
        </div>
      </div>

      <h3 class="etiqueta" style="color:var(--tinta-suave);margin-top:var(--e4)">Datos privados</h3>
      <p class="menudo" style="margin-top:4px">
        Dirección del alojamiento, referencias de reserva, teléfonos. Nunca salen de este navegador.
      </p>
      <div style="margin-top:var(--e3)">
        ${privados.campos.length ? privados.campos.map((c, i) => html`
          <div class="dato-privado">
            <div class="dato-privado__clave">${c.clave}</div>
            <div class="dato-privado__valor">${c.valor}</div>
            <button type="button" class="icono-boton" data-quitar-privado="${i}"
                    aria-label="Quitar ${c.clave}">${icono('papelera')}</button>
          </div>`) : crudo('<p class="menudo" style="color:var(--tinta-suave)">Ninguno guardado todavía.</p>')}
      </div>
      <button type="button" class="boton boton--bloque" data-accion="anadir-privado" style="margin-top:var(--e3)">
        ${icono('mas')}Añadir un dato
      </button>

      <h3 class="etiqueta" style="color:var(--tinta-suave);margin-top:var(--e5)">Recuerdos</h3>
      <p class="menudo" style="margin-top:4px">
        Lo visitado, las notas y las fotos. Si limpias el navegador se pierden: el archivo es la única copia.
      </p>
      <div style="display:flex;gap:8px;margin-top:var(--e3);flex-wrap:wrap">
        <button type="button" class="boton" data-accion="exportar">${icono('descarga')}Exportar</button>
        <label class="boton" tabindex="0">${icono('importar')}Importar
          <input type="file" accept="application/json" class="solo-lectores" data-campo="importar">
        </label>
      </div>
    </section>`;
}

export async function montarPerfil(raiz) {
  const configurada = await nube.configurada();
  const usuario = nube.usuario();
  const registro = await cargarRegistro().catch(() => ({ viajes: [] }));
  const tema = preferenciaActual();

  raiz.className = 'registro scroll-y';
  raiz.innerHTML = html`
    <div class="registro__interior">
      <header class="perfil__cabecera">
        <a class="icono-boton" href="#/" aria-label="Volver al registro">${icono('atras')}</a>
        <div style="flex:1;min-width:0">
          <h1 class="display">Tus datos</h1>
          <p class="secundario" style="margin-top:var(--e3);max-width:46ch">
            Tu cuenta y lo que solo vive en este navegador. El contenido de cada
            viaje —los días, el presupuesto, el transporte— está dentro del viaje.
          </p>
        </div>
      </header>

      <section class="tarjeta-datos">
        <h2 class="titulo-2">Cuenta</h2>
        ${!configurada ? crudo(`
          <p class="menudo" style="margin-top:var(--e2)">
            La nube no está configurada, así que no hay sesión que iniciar. Bitácora
            funciona igual: lee los viajes del repositorio y guarda lo tuyo aquí. Para
            activarla hace falta <code>data/nube.json</code> — ver <code>supabase/LEEME.md</code>.
          </p>`) : usuario ? html`
          <p class="secundario" style="margin-top:var(--e2)">Dentro como <b>${usuario.correo}</b>.</p>
          <div class="datos" style="margin-top:var(--e4)">
            <div class="datos__fila">
              <div class="datos__clave">Conexión</div>
              <div class="datos__valor" data-estado-nube>Comprobando…</div>
            </div>
            <div class="datos__fila">
              <div class="datos__clave">Tu id</div>
              <div class="datos__valor">
                <code class="menudo">${usuario.id}</code>
                <span class="menudo" style="display:block">Pásaselo a quien quieras invitar a un viaje.</span>
              </div>
            </div>
          </div>
          <button type="button" class="boton boton--fantasma" data-accion="salir-nube" style="margin-top:var(--e4)">
            Cerrar sesión
          </button>
          <p class="menudo" style="margin-top:var(--e3)">
            Cerrar sesión no borra nada de este dispositivo.
          </p>` : html`
          <p class="secundario" style="margin-top:var(--e2)">
            Entra con tu correo para sincronizar los viajes entre dispositivos y poder
            compartirlos. Se manda un enlace: no hay contraseña que recordar.
          </p>
          <div class="campo campo--ancho" style="margin-top:var(--e4)">
            <label class="etiqueta" for="correo-nube">Correo</label>
            <input id="correo-nube" type="email" inputmode="email" data-correo-nube
                   placeholder="tu@correo.com" autocomplete="email"
                   spellcheck="false" autocapitalize="off" autocorrect="off">
          </div>
          <button type="button" class="boton boton--principal boton--bloque" data-accion="entrar-nube" style="margin-top:var(--e3)">
            ${icono('nube')}Mandarme el enlace de acceso
          </button>
          <p class="menudo" style="margin-top:var(--e3)">
            <b>Ábrelo en este mismo dispositivo</b>, y abre el correo más reciente:
            cada enlace que pides anula el anterior.
          </p>`}
      </section>

      ${registro.viajes.map(tarjetaDeViaje)}

      <section class="tarjeta-datos">
        <h2 class="titulo-2">Apariencia</h2>
        <p class="menudo" style="margin-top:var(--e2)">
          «Automático» sigue lo que tenga puesto el móvil, que ya cambia solo de noche.
        </p>
        <div class="opciones" role="radiogroup" aria-label="Tema">
          ${TEMAS.map((t) => html`
            <button type="button" class="opcion" role="radio" data-tema="${t.id}"
                    aria-checked="${String(tema === t.id)}">
              ${icono(t.icono)}
              <span>
                <span class="opcion__nombre">${t.etiqueta}</span>
                ${t.pista ? crudo(`<span class="opcion__pista menudo">${esc(t.pista)}</span>`) : ''}
              </span>
            </button>`)}
        </div>
      </section>

      <section class="tarjeta-datos">
        <h2 class="titulo-2">Almacenamiento</h2>
        <p class="menudo" style="margin-top:var(--e2)">
          Lo que ocupa Bitácora en este navegador contando todos los viajes: lo marcado
          y las notas, las fotos, y los mapas descargados para usar sin conexión.
        </p>
        <p class="cuerpo" data-ocupacion style="margin-top:var(--e3)">Midiendo…</p>
      </section>

      <footer style="margin-top:var(--e7);padding-top:var(--e5);border-top:1px solid var(--borde)">
        <p class="menudo">
          Bitácora no manda nada a ninguna parte salvo que configures la nube, y ni
          siquiera entonces salen del navegador las fotos ni los datos privados.
        </p>
      </footer>
    </div>`;

  const recargar = () => montarPerfil(raiz);

  // --- Cuenta ---------------------------------------------------------------
  alPulsar(raiz, '[data-accion="entrar-nube"]', async (boton) => {
    const correo = $('[data-correo-nube]', raiz)?.value.trim();
    if (!correo || !correo.includes('@')) { brindis('Escribe un correo válido', { tipo: 'error' }); return; }
    boton.disabled = true;
    try {
      await nube.pedirAcceso(correo);
      brindis('Enlace enviado. Ábrelo en este dispositivo.', { tipo: 'ok', duracion: 7000 });
    } catch (e) {
      brindis(e.message, { tipo: 'error', duracion: 5000 });
    } finally {
      boton.disabled = false;
    }
  });

  alPulsar(raiz, '[data-accion="salir-nube"]', async () => {
    await nube.salir();
    brindis('Sesión cerrada. Tus datos siguen en este navegador.');
    recargar();
  });

  // --- Tema -----------------------------------------------------------------
  alPulsar(raiz, '[data-tema]', (b) => {
    const elegido = fijarTema(b.dataset.tema);
    // Solo se repintan los tres botones: repintar la pantalla entera por cambiar
    // el tema perdería el sitio del scroll y se vería como un parpadeo.
    for (const o of $$('[data-tema]', raiz)) o.setAttribute('aria-checked', String(o.dataset.tema === elegido));
  });

  // --- Datos privados y recuerdos, por viaje --------------------------------
  // El id del viaje sale de la tarjeta que contiene al botón: así el manejador es
  // uno solo para todas, y añadir un viaje no obliga a tocar nada de aquí.
  const viajeDe = (nodo) => nodo.closest('[data-viaje]')?.dataset.viaje;

  alPulsar(raiz, '[data-accion="anadir-privado"]', (b) => {
    const id = viajeDe(b);
    const clave = prompt('¿Qué dato? (por ejemplo: Dirección, Reserva, Teléfono)');
    if (!clave) return;
    const valor = prompt(`Valor de "${clave}"`);
    if (!valor) return;
    const datos = estado.privadosDe(id);
    datos.campos.push({ clave, valor });
    estado.guardarPrivados(id, datos);
    brindis('Guardado solo en este navegador', { tipo: 'ok' });
    recargar();
  });

  alPulsar(raiz, '[data-quitar-privado]', (b) => {
    const id = viajeDe(b);
    const datos = estado.privadosDe(id);
    datos.campos.splice(Number(b.dataset.quitarPrivado), 1);
    estado.guardarPrivados(id, datos);
    recargar();
  });

  alPulsar(raiz, '[data-accion="exportar"]', async (b) => {
    const id = viajeDe(b);
    const paquete = await estado.exportar(id);
    const url = URL.createObjectURL(new Blob([JSON.stringify(paquete, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `bitacora-${id}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    brindis('Recuerdos exportados', { tipo: 'ok' });
  });

  raiz.addEventListener('change', async (e) => {
    if (e.target.dataset?.campo !== 'importar') return;
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    try {
      const r = await estado.importar(JSON.parse(await archivo.text()));
      brindis(`Importado: ${plural(r.notas, 'nota')}, ${plural(r.fotos, 'foto')} y ${plural(r.paradas, 'parada propia', 'paradas propias')}`,
        { tipo: 'ok', duracion: 5000 });
      recargar();
    } catch (err) {
      brindis(err.message, { tipo: 'error', duracion: 5000 });
    }
    e.target.value = '';
  });

  // --- Lo que se mide después de pintar -------------------------------------
  // Nada de esto retrasa la primera pintada: una pantalla que tarda en aparecer
  // por medir el disco es peor que una que aparece y rellena dos huecos.
  if (configurada && nube.haySesion()) {
    nube.comprobar().then((r) => {
      const n = $('[data-estado-nube]', raiz);
      if (n) n.textContent = r.motivo;
    });
  }

  // Las fotos están en IndexedDB y no se pueden contar de forma síncrona: se
  // añaden a la línea cuando llegan, en vez de reservarles un hueco que diga
  // «…» mientras tanto.
  for (const v of registro.viajes) {
    estado.contarFotos(v.id).then((n) => {
      if (!n) return;
      const nodo = $(`[data-viaje="${v.id}"] [data-cuentas]`, raiz);
      if (!nodo) return;
      const hay = nodo.textContent.trim();
      const foto = plural(n, 'foto');
      nodo.textContent = hay.startsWith('Todavía') ? foto : `${hay} · ${foto}`;
    });
  }

  estado.ocupacion().then((o) => {
    const n = $('[data-ocupacion]', raiz);
    if (!n) return;
    if (!o) { n.textContent = 'Este navegador no dice cuánto tiene guardado.'; return; }
    const mb = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0);
    n.innerHTML = html`<b>${mb(o.usado)} MB</b> usados de ${mb(o.total)} MB disponibles.`.toString();
  });

  return { nombre: 'perfil', destruir() {} };
}
