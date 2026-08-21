/**
 * Supabase como backend, sin el SDK.
 *
 * **Por qué sin SDK:** PostgREST y GoTrue son HTTP plano. El SDK de Supabase
 * son unos 50 KB y una dependencia de npm, y este sitio no tiene ninguna ni
 * paso de compilación. Con `fetch` se hace lo mismo y se lee entero.
 *
 * **La regla que no se rompe: la nube es la fuente, el repositorio es el suelo.**
 * Si no hay `data/nube.json`, si no hay sesión, o si Supabase no responde, la
 * aplicación funciona exactamente como antes — leyendo el JSON del repositorio
 * y guardando en el navegador. Esto no es prudencia teórica: el proyecto de
 * Supabase anterior de esta cuenta se evaporó, así que un backend que sea punto
 * único de fallo ya se ha demostrado mala idea una vez.
 */

const CLAVE_SESION = 'bitacora:v1:sesion';
let cfg = null;
let cargandoCfg = null;

/** Lee data/nube.json. Si no está, la nube queda desactivada y no pasa nada. */
export function configuracion() {
  if (cfg !== null) return Promise.resolve(cfg);
  if (cargandoCfg) return cargandoCfg;
  cargandoCfg = fetch('data/nube.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { cfg = d?.url && d?.clavePublicable ? d : false; return cfg; })
    .catch(() => { cfg = false; return cfg; });
  return cargandoCfg;
}

export const configurada = async () => Boolean(await configuracion());

// --- Sesión ---------------------------------------------------------------

const leerSesion = () => {
  try { return JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); } catch { return null; }
};
const escribirSesion = (s) => {
  if (s) localStorage.setItem(CLAVE_SESION, JSON.stringify(s));
  else localStorage.removeItem(CLAVE_SESION);
};

export function usuario() {
  const s = leerSesion();
  return s?.user ? { id: s.user.id, correo: s.user.email } : null;
}

export const haySesion = () => Boolean(leerSesion()?.access_token);

/** Renueva el token si le quedan menos de dos minutos. */
async function tokenValido() {
  const s = leerSesion();
  if (!s?.access_token) return null;
  const margen = 120;
  if (s.expires_at && s.expires_at - margen > Math.floor(Date.now() / 1000)) return s.access_token;
  if (!s.refresh_token) { escribirSesion(null); return null; }

  const c = await configuracion();
  const res = await fetch(`${c.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: c.clavePublicable, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!res.ok) { escribirSesion(null); return null; }
  const nueva = await res.json();
  escribirSesion({ ...nueva, expires_at: Math.floor(Date.now() / 1000) + (nueva.expires_in || 3600) });
  return nueva.access_token;
}

/**
 * Manda un enlace de acceso al correo.
 *
 * Enlace mágico y no contraseña a propósito: para dos personas, una contraseña
 * añade recuperación, gestor de contraseñas y un campo más que rellenar en un
 * móvil. El enlace se pide una vez por dispositivo y la sesión se renueva sola.
 */
export async function pedirAcceso(correo) {
  const c = await configuracion();
  if (!c) throw new Error('La nube no está configurada');
  // El destino del enlace va como parámetro de CONSULTA, no en el cuerpo: la
  // API de GoTrue lee `redirect_to` de la URL, y `options.emailRedirectTo` es
  // una comodidad del SDK que por debajo hace exactamente esto. Puesto en el
  // cuerpo se ignora en silencio y el enlace del correo aterriza en la Site URL
  // del proyecto —que en uno recién creado es http://localhost:3000—.
  // El destino además tiene que estar en la lista de Redirect URLs del panel.
  const destino = encodeURIComponent(location.origin + location.pathname);
  const res = await fetch(`${c.url}/auth/v1/otp?redirect_to=${destino}`, {
    method: 'POST',
    headers: { apikey: c.clavePublicable, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: correo, create_user: true }),
  });
  if (!res.ok) throw new Error(`No se ha podido enviar el enlace (${res.status})`);
  return true;
}

/**
 * Recoge la sesión que Supabase deja en el fragmento de la URL al volver del
 * correo. Hay que llamarla en el arranque, **antes** de enrutar: si no, el
 * enrutador ve un hash que no entiende y se va a la portada.
 *
 * Devuelve `{ ok: true }` si la sesión ha entrado, `{ error, codigo }` si
 * Supabase ha devuelto un fallo, y `null` si el fragmento no traía nada de
 * esto. **La rama de error no es decorativa.** Un enlace muerto vuelve como
 * `#error=access_denied&error_code=otp_expired`, y devolviendo `false` para
 * todo lo que no fuera un token la aplicación aterrizaba en la portada sin
 * sesión y **sin decir una palabra** — indistinguible de no haber hecho nada.
 * Pasó de verdad el 21 de agosto de 2026 y costó media hora de diagnóstico.
 */
export function recogerSesionDeUrl() {
  const bruto = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  const p = new URLSearchParams(bruto);
  const token = p.get('access_token');

  if (!token) {
    const codigo = p.get('error_code') || p.get('error');
    if (!codigo) return null;
    // Se limpia la URL también en el error: si no, recargar lo repite.
    limpiarUrl();
    return { error: p.get('error_description') || codigo, codigo };
  }

  escribirSesion({
    access_token: token,
    refresh_token: p.get('refresh_token'),
    expires_at: Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600),
    user: leerUsuarioDeToken(token),
  });
  limpiarUrl();
  return { ok: true };
}

function limpiarUrl() {
  history.replaceState(null, '', location.pathname + location.search);
}

/** El payload del JWT, sin verificar firma: solo se usa para pintar el correo. */
function leerUsuarioDeToken(token) {
  try {
    const carga = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { id: carga.sub, email: carga.email };
  } catch { return null; }
}

export async function salir() {
  const c = await configuracion();
  const t = leerSesion()?.access_token;
  escribirSesion(null);
  if (c && t) {
    fetch(`${c.url}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: c.clavePublicable, Authorization: `Bearer ${t}` },
    }).catch(() => {});
  }
}

// --- Consultas ------------------------------------------------------------

async function api(ruta, opciones = {}) {
  const c = await configuracion();
  if (!c) throw new Error('La nube no está configurada');
  const token = await tokenValido();
  if (!token) throw new Error('Sin sesión');

  const res = await fetch(`${c.url}/rest/v1/${ruta}`, {
    ...opciones,
    headers: {
      apikey: c.clavePublicable,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...opciones.headers,
    },
  });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${cuerpo.slice(0, 160)}`);
  }
  return leerCuerpo(res);
}

/**
 * El cuerpo de una respuesta de PostgREST, o `null` si no trae ninguno.
 *
 * **Mirar el 204 no basta, y creerlo costó un fallo de los malos.** Con
 * `Prefer: return=minimal` un upsert que va bien contesta **200 y el cuerpo
 * vacío**, no 204, y `res.json()` sobre la nada lanza `Unexpected end of JSON
 * input`. El error saltaba **después** de que la escritura hubiera funcionado:
 * decía que había fallado algo que estaba hecho y empujaba a repetirlo. Se lee
 * como texto y se parsea solo si hay algo que parsear.
 *
 * Exportada a propósito: es pura y sin red, así que se prueba en Node.
 */
export async function leerCuerpo(res) {
  const texto = await res.text();
  return texto ? JSON.parse(texto) : null;
}

// --- Conversión entre el documento y la fila ------------------------------
// Puro y sin red, para poder probarlo en Node.

/** Documento del viaje → fila de la tabla `viajes`. */
export function aFila(viaje, propietarioId) {
  if (!viaje?.id) throw new Error('El viaje necesita id');
  if (!viaje.fechas?.inicio || !viaje.fechas?.fin) throw new Error('El viaje necesita fechas');
  return {
    id: viaje.id,
    propietario: propietarioId,
    titulo: viaje.titulo,
    subtitulo: viaje.subtitulo || null,
    fecha_inicio: viaje.fechas.inicio,
    fecha_fin: viaje.fechas.fin,
    estado: viaje.estado || 'planificado',
    datos: viaje,
  };
}

/** Fila de la tabla → documento, con la versión pegada para poder guardar. */
export function aDocumento(fila) {
  if (!fila) return null;
  return { ...fila.datos, id: fila.id, versionNube: fila.version, actualizadoEn: fila.actualizado_en };
}

// --- Viajes ---------------------------------------------------------------

export async function listarViajes() {
  const filas = await api('viajes?select=id,titulo,subtitulo,fecha_inicio,fecha_fin,estado,version,actualizado_en&order=fecha_inicio.desc');
  return filas.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    subtitulo: f.subtitulo || '',
    fechas: { inicio: f.fecha_inicio, fin: f.fecha_fin },
    estado: f.estado,
    versionNube: f.version,
  }));
}

export async function leerViaje(id) {
  const filas = await api(`viajes?id=eq.${encodeURIComponent(id)}&select=*`);
  return aDocumento(filas[0]);
}

export async function crearViaje(viaje) {
  const yo = usuario();
  if (!yo) throw new Error('Sin sesión');
  const filas = await api('viajes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(aFila(viaje, yo.id)),
  });
  return aDocumento(filas[0]);
}

/**
 * Guarda el viaje solo si nadie lo ha tocado desde que se leyó.
 *
 * El filtro `version=eq.<la que tenía>` es lo que convierte esto en seguro: si
 * el otro móvil guardó primero, no coincide, no se actualiza ninguna fila y se
 * devuelve conflicto en vez de pisarle el trabajo.
 */
export async function guardarViaje(viaje, versionEsperada) {
  const { versionNube, actualizadoEn, ...datos } = viaje;
  const filas = await api(
    `viajes?id=eq.${encodeURIComponent(viaje.id)}&version=eq.${Number(versionEsperada)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        titulo: datos.titulo,
        subtitulo: datos.subtitulo || null,
        fecha_inicio: datos.fechas.inicio,
        fecha_fin: datos.fechas.fin,
        estado: datos.estado || 'planificado',
        datos,
      }),
    },
  );
  if (!filas.length) {
    const e = new Error('Alguien ha guardado este viaje antes que tú. Recarga para no pisarle los cambios.');
    e.conflicto = true;
    throw e;
  }
  return aDocumento(filas[0]);
}

// --- Estado personal ------------------------------------------------------

export async function leerEstado(viajeId) {
  const yo = usuario();
  if (!yo) return null;
  const filas = await api(`estado_personal?viaje_id=eq.${encodeURIComponent(viajeId)}&usuario_id=eq.${yo.id}&select=*`);
  const f = filas[0];
  return f ? { visitados: f.visitados, notas: f.notas, tareas: f.tareas, vistos: f.vistos } : null;
}

export async function guardarEstado(viajeId, estado) {
  const yo = usuario();
  if (!yo) throw new Error('Sin sesión');
  await api('estado_personal', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      viaje_id: viajeId,
      usuario_id: yo.id,
      visitados: estado.visitados || {},
      notas: estado.notas || {},
      tareas: estado.tareas || {},
      vistos: estado.vistos || {},
    }),
  });
}

// --- Compartir ------------------------------------------------------------

export async function miembros(viajeId) {
  return api(`viaje_miembros?viaje_id=eq.${encodeURIComponent(viajeId)}&select=usuario_id,rol,creado_en`);
}

/**
 * Invitar exige el id del usuario, no su correo: `auth.users` no es consultable
 * desde el cliente y está bien que no lo sea. El invitado entra una vez con su
 * correo y comparte su identificador, que se ve en Viaje → Nube.
 */
export async function invitar(viajeId, usuarioId, rol = 'editor') {
  await api('viaje_miembros', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ viaje_id: viajeId, usuario_id: usuarioId, rol }),
  });
}

/** Comprueba que se llega y que la sesión sirve. Devuelve un diagnóstico legible. */
export async function comprobar() {
  const c = await configuracion();
  if (!c) return { ok: false, motivo: 'Sin data/nube.json: la aplicación funciona en local' };
  if (!haySesion()) return { ok: false, motivo: 'Configurada, pero sin sesión iniciada' };
  try {
    const v = await listarViajes();
    return { ok: true, motivo: `Conectado · ${v.length} viaje(s) en la nube`, viajes: v.length };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}
