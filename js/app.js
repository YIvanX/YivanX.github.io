/**
 * Arranque y enrutado.
 *
 * Rutas por hash a propósito: GitHub Pages sirve archivos estáticos y no sabe
 * reescribir rutas, así que `/v/leon-2026-08` daría 404 al recargar. Con hash
 * la URL sigue siendo compartible y recargable sin servidor que colabore.
 *
 *   #/                              el registro de viajes
 *   #/perfil                        la cuenta: sesión y almacenamiento
 *   #/v/<viaje>                     el viaje, día por defecto
 *   #/v/<viaje>/portada             el viaje entero: de aquí cuelga lo demás
 *   #/v/<viaje>/d/<AAAA-MM-DD>      un día
 *   #/v/<viaje>/d/pre               preparativos, antes de salir
 *   #/v/<viaje>/d/post              al volver
 *   #/v/<viaje>/l/<lugar>?d=<día>   la ficha de un lugar
 *   #/v/<viaje>/transporte|listas
 *
 * Se entra a un viaje por su **día**, no por su portada. La jerarquía dice que
 * el viaje contiene al día, pero durante el viaje se abre esto veinte veces al
 * día para ver qué toca ahora, y ese gesto no puede costar un toque más. A la
 * portada se sube con el icono de la maleta en la cabecera, o tocando el título.
 */

import { html, icono, $ } from './ui/dom.js';
import { montarRegistro } from './vistas/registro.js';
import { montarPerfil } from './vistas/perfil.js';
import { montarViaje } from './vistas/viaje.js';
import { brindis } from './ui/brindis.js';
import { recogerSesionDeUrl } from './nube.js';

const raiz = document.getElementById('app');
let vistaActual = null;

function analizar(hash) {
  const [camino, consulta] = (hash || '').replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(consulta || '');
  const partes = camino.split('/').filter(Boolean);

  if (partes[0] === 'perfil') return { nombre: 'perfil' };
  if (partes[0] !== 'v' || !partes[1]) return { nombre: 'registro' };

  const viajeId = partes[1];
  const seccion = partes[2];

  if (seccion === 'd' && partes[3]) {
    // 'pre' y 'post' son pestañas de la barra de días que no son fechas. Van por
    // la misma ruta a propósito: se seleccionan en la misma barra y se recorren
    // con el mismo gesto, así que compartir prefijo es lo coherente.
    const vista = partes[3] === 'pre' || partes[3] === 'post' ? partes[3] : 'dia';
    return { nombre: 'viaje', viajeId, vista, fecha: partes[3] };
  }
  if (seccion === 'l' && partes[3]) return { nombre: 'viaje', viajeId, vista: 'lugar', lugarId: partes[3], fecha: params.get('d') || null };
  // `info` era el nombre viejo de la portada. Se mantiene para no dejar muerto
  // ningún enlace ya compartido.
  if (seccion === 'info') return { nombre: 'viaje', viajeId, vista: 'portada', fecha: null };
  if (['transporte', 'listas', 'portada'].includes(seccion)) return { nombre: 'viaje', viajeId, vista: seccion, fecha: params.get('d') || null };
  return { nombre: 'viaje', viajeId, vista: 'dia', fecha: null };
}

function fallo(mensaje, detalle) {
  vistaActual?.destruir?.();
  vistaActual = null;
  raiz.className = '';
  raiz.innerHTML = html`
    <div style="max-width:34rem;margin:0 auto;padding:var(--e8) var(--e5)">
      <h1 class="titulo-1">${mensaje}</h1>
      ${detalle ? html`<p class="secundario" style="margin-top:var(--e3)">${detalle}</p>` : ''}
      <p style="margin-top:var(--e5)"><a class="boton" href="#/">${icono('atras')}Volver al registro</a></p>
    </div>`;
}

async function enrutar() {
  const ruta = analizar(location.hash);

  try {
    if (ruta.nombre === 'registro') {
      if (vistaActual?.viajeId || vistaActual?.nombre === 'perfil') { vistaActual.destruir(); vistaActual = null; }
      if (!vistaActual) vistaActual = await montarRegistro(raiz);
      document.title = 'Bitácora';
    } else if (ruta.nombre === 'perfil') {
      vistaActual?.destruir?.();
      vistaActual = await montarPerfil(raiz);
      document.title = 'Tu perfil · Bitácora';
    } else {
      // Cambiar de día o abrir una ficha no vuelve a montar el mapa.
      if (vistaActual?.viajeId === ruta.viajeId) {
        vistaActual.actualizar(ruta);
      } else {
        vistaActual?.destruir?.();
        vistaActual = null;
        raiz.className = 'cargando';
        raiz.innerHTML = '<span class="girador" role="status" aria-label="Cargando"></span>';
        vistaActual = await montarViaje(raiz, ruta);
      }
      // El título se fija en cada vuelta, no solo al montar: si no, el de la
      // pantalla anterior —«Tu perfil»— se quedaba pegado en la pestaña del
      // navegador mientras estabas mirando un día del viaje.
      document.title = `${vistaActual.titulo || 'Bitácora'} · Bitácora`;
    }
  } catch (e) {
    console.error(e);
    fallo('No se ha podido abrir esto', e.message);
  }
}

// Al volver del enlace de acceso, Supabase deja la sesión en el fragmento de la
// URL. Hay que recogerla ANTES de enrutar: si no, el enrutador ve un hash que no
// entiende y se va a la portada perdiendo la sesión.
//
// Y el fragmento puede traer un error en vez de un token, que es lo que pasa con
// un enlace muerto. Se traduce aquí y no se enseña el texto de Supabase tal cual:
// viene en inglés y no dice qué hacer, que es lo único que le importa a quien
// está mirando el móvil.
const MENSAJES_DE_ACCESO = {
  otp_expired: 'Ese enlace ya no vale. Pide uno nuevo y abre el correo más reciente: cada enlace que pides anula el anterior.',
  access_denied: 'Supabase ha rechazado el acceso con ese enlace. Pide uno nuevo.',
};

const vuelta = recogerSesionDeUrl();
if (vuelta?.ok) {
  brindis('Sesión iniciada', { tipo: 'ok' });
} else if (vuelta?.error) {
  brindis(MENSAJES_DE_ACCESO[vuelta.codigo] || `No se ha podido entrar: ${vuelta.error}`,
    { tipo: 'error', duracion: 9000 });
}

addEventListener('hashchange', enrutar);
enrutar();

// --- Service worker -------------------------------------------------------
// Solo sobre https o localhost. En file:// no hay service worker y la
// aplicación tiene que seguir funcionando igual, solo que sin modo offline.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.warn('Service worker no registrado:', e.message);
    });
  });
}

// Avisar de la vuelta de la conexión solo si de verdad se ha ido: un aviso al
// arrancar sería ruido.
let estuvoSinRed = false;
addEventListener('offline', () => { estuvoSinRed = true; brindis('Sin conexión. La guía sigue funcionando.', { tipo: 'info', duracion: 4000 }); });
addEventListener('online', () => { if (estuvoSinRed) { estuvoSinRed = false; brindis('Conexión recuperada', { tipo: 'ok' }); } });
