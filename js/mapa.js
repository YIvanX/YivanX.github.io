/**
 * Mapa. Envuelve Leaflet para que el resto de la aplicación no sepa que existe.
 *
 * Leaflet se carga bajo demanda: la portada del registro no necesita un mapa y
 * no tiene por qué pagar 147 KB por si acaso.
 */

import { CATEGORIAS } from './datos.js';
import { esc } from './ui/dom.js';

const TESELAS = {
  claro: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  oscuro: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
};
const ATRIBUCION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const MAX_TESELAS_SIN_CONEXION = 420;

let promesaLeaflet = null;

function cargarLeaflet() {
  if (globalThis.L) return Promise.resolve(globalThis.L);
  if (promesaLeaflet) return promesaLeaflet;
  promesaLeaflet = new Promise((resolver, rechazar) => {
    const s = document.createElement('script');
    s.src = 'vendor/leaflet/leaflet.js';
    s.onload = () => resolver(globalThis.L);
    s.onerror = () => rechazar(new Error('No se ha podido cargar Leaflet desde vendor/'));
    document.head.appendChild(s);
  });
  return promesaLeaflet;
}

// --- Aritmética de teselas (para la descarga sin conexión) ----------------
const aX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const aY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

function teselasDe(recuadro, z) {
  const [[sur, oeste], [norte, este]] = recuadro;
  const salida = [];
  const limite = 2 ** z;
  for (let x = aX(oeste, z); x <= aX(este, z); x += 1) {
    for (let y = aY(norte, z); y <= aY(sur, z); y += 1) {
      if (x >= 0 && y >= 0 && x < limite && y < limite) salida.push({ x, y, z });
    }
  }
  return salida;
}

export class Mapa {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.mapa = null;
    this.L = null;
    this.capaTeselas = null;
    this.marcadores = new Map();   // clave de bloque o id de lugar → marcador
    this.capaMarcadores = null;
    this.capaRuta = null;
    this.marcadorYo = null;
    this.destacado = null;
    this.alSeleccionar = () => {};
    // Cuántos píxeles del mapa tapa algo por abajo (la hoja arrastrable del
    // móvil). Sin esto, fitBounds centra en el alto completo y la mitad de los
    // marcadores del día quedan debajo del panel, invisibles.
    this.margenInferior = () => 0;
  }

  /**
   * `recuadro`, si viene, fija el encuadre **antes** de crear la capa de
   * teselas. Sin eso el mapa nace en la vista general, pide sus teselas, y
   * medio segundo después el primer `fitBounds` las aborta todas: unas veinte
   * peticiones tiradas en cada carga, que con datos móviles no es gratis.
   */
  async iniciar({ centro = [40, -4], zoom = 6, oscuro = false, puntos = null, margenInferior = null } = {}) {
    const L = await cargarLeaflet();
    this.L = L;

    this.mapa = L.map(this.contenedor, {
      center: centro,
      zoom,
      zoomControl: false,
      attributionControl: true,
      // Con la rueda del ratón el mapa se movía al hacer scroll en la página.
      // En escritorio el mapa tiene columna propia, así que aquí sí se permite.
      scrollWheelZoom: true,
      tap: false,
      preferCanvas: false,
    });

    // El encuadre inicial tiene que salir **idéntico** al que hará después
    // `mostrarDia`, no solo parecido: si difiere en un nivel de zoom, la capa de
    // teselas pide un juego que se aborta medio segundo más tarde.
    if (margenInferior) this.margenInferior = margenInferior;
    if (puntos?.length) this.encuadrar(puntos);

    this.capaTeselas = L.tileLayer(oscuro ? TESELAS.oscuro : TESELAS.claro, {
      attribution: ATRIBUCION,
      subdomains: 'abcd',
      maxZoom: 19,
      detectRetina: true,
      crossOrigin: true,
    }).addTo(this.mapa);

    this.capaRuta = L.layerGroup().addTo(this.mapa);
    this.capaMarcadores = L.layerGroup().addTo(this.mapa);
    return this;
  }

  aplicarTema(oscuro) {
    if (!this.capaTeselas) return;
    this.capaTeselas.setUrl(oscuro ? TESELAS.oscuro : TESELAS.claro);
  }

  refrescarTamano() {
    this.mapa?.invalidateSize({ animate: false });
  }

  // --- Marcadores ---------------------------------------------------------

  _icono(lugar, { numero = null, visitado = false, secundario = false } = {}) {
    const cat = CATEGORIAS[lugar.categoria] || CATEGORIAS.practico;
    const clases = ['pin'];
    if (numero) clases.push('pin--numerado');
    if (secundario) clases.push('pin--secundario');
    const interior = numero
      ? String(numero)
      : `<svg aria-hidden="true"><use href="#i-${esc(cat.icono)}"/></svg>`;
    const tam = secundario ? 15 : numero ? 28 : 26;

    return this.L.divIcon({
      className: 'marcador',
      html: `<div class="${clases.join(' ')}" data-cat="${esc(lugar.categoria)}" data-visitado="${visitado}">${interior}</div>`,
      iconSize: [tam, tam],
      iconAnchor: [tam / 2, tam / 2],
      popupAnchor: [0, -tam / 2],
    });
  }

  _globo(lugar) {
    const cat = CATEGORIAS[lugar.categoria] || CATEGORIAS.practico;
    const foto = lugar.imagen
      ? `<img class="globo__foto" src="${esc(lugar.imagen.archivo)}" alt="" loading="lazy" decoding="async"
              title="${esc(lugar.imagen.credito)}">`
      : '';
    return `${foto}<div class="globo__titulo">${esc(lugar.nombre)}</div>
      <div class="globo__resumen">${esc(lugar.resumen)}</div>
      <div class="globo__pie"><span class="chip chip--${esc(lugar.categoria)}">${esc(cat.etiqueta)}</span></div>`;
  }

  _limpiar() {
    this.capaMarcadores?.clearLayers();
    this.capaRuta?.clearLayers();
    this.marcadores.clear();
    this.destacado = null;
  }

  /**
   * Pinta un día: las paradas numeradas en el orden en que se visitan, el trazo
   * que las une, y los puntos de traslado en pequeño para que se entienda por
   * dónde se pasa sin competir con las paradas de verdad.
   */
  mostrarDia(dia, { visitados = {} } = {}) {
    if (!this.mapa) return;
    this._limpiar();

    // Un mismo lugar puede aparecer dos veces en un día — comer donde ya se ha
    // estado por la mañana, por ejemplo. Dos marcadores en la misma coordenada
    // se tapan y el de debajo es inalcanzable, así que se funden en uno con los
    // dos números: "1·3".
    const porLugar = new Map();
    const puntos = [];
    for (const bloque of dia.paradas) {
      puntos.push(bloque.lugar.coords);
      if (!porLugar.has(bloque.lugar.id)) porLugar.set(bloque.lugar.id, []);
      porLugar.get(bloque.lugar.id).push(bloque);
    }

    for (const [lugarId, bloques] of porLugar) {
      const lugar = bloques[0].lugar;
      const etiqueta = bloques.map((b) => b.orden).join('·');
      const marcador = this.L.marker(lugar.coords, {
        icon: this._icono(lugar, { numero: etiqueta, visitado: Boolean(visitados[lugarId]) }),
        keyboard: true,
        title: `${etiqueta}. ${lugar.nombre}`,
        riseOnHover: true,
        zIndexOffset: 200,
      });
      marcador.bindPopup(this._globo(lugar), { closeButton: false, offset: [0, -6] });
      marcador.on('click', () => this.alSeleccionar(lugarId));
      marcador.addTo(this.capaMarcadores);
      for (const b of bloques) this.marcadores.set(b.clave, marcador);
      this.marcadores.set(lugarId, marcador);
    }

    // Extremos de traslado que no son parada del día (una estación de paso).
    const yaPuestos = new Set(porLugar.keys());
    for (const bloque of dia.bloques) {
      if (bloque.tipo !== 'traslado') continue;
      for (const lugar of [bloque.lugarDesde, bloque.lugarHasta]) {
        if (!lugar || yaPuestos.has(lugar.id)) continue;
        yaPuestos.add(lugar.id);
        const m = this.L.marker(lugar.coords, {
          icon: this._icono(lugar, { secundario: true, visitado: Boolean(visitados[lugar.id]) }),
          title: lugar.nombre,
        });
        m.bindPopup(this._globo(lugar), { closeButton: false });
        m.on('click', () => this.alSeleccionar(lugar.id));
        m.addTo(this.capaMarcadores);
        this.marcadores.set(lugar.id, m);
      }
    }

    if (puntos.length > 1) {
      this.L.polyline(puntos, { className: 'ruta-dia', interactive: false }).addTo(this.capaRuta);
    }
    this.encuadrar(dia.paradas.length ? puntos : [...this.marcadores.values()].map((m) => m.getLatLng()));
  }

  /** Todos los lugares del viaje, sin números y coloreados por categoría. */
  mostrarTodo(viaje, { visitados = {} } = {}) {
    if (!this.mapa) return;
    this._limpiar();
    for (const lugar of viaje.lugaresUsados) {
      const m = this.L.marker(lugar.coords, {
        icon: this._icono(lugar, { visitado: Boolean(visitados[lugar.id]) }),
        title: lugar.nombre,
        riseOnHover: true,
      });
      m.bindPopup(this._globo(lugar), { closeButton: false, offset: [0, -6] });
      m.on('click', () => this.alSeleccionar(lugar.id));
      m.addTo(this.capaMarcadores);
      this.marcadores.set(lugar.id, m);
    }
    this.encuadrar(viaje.lugaresUsados.map((l) => l.coords));
  }

  encuadrar(puntos) {
    if (!puntos?.length || !this.mapa) return;
    const abajo = this.margenInferior();
    if (puntos.length === 1) {
      this.mapa.setView(puntos[0], 15, { animate: false });
      if (abajo) this.mapa.panBy([0, abajo / 2], { animate: false });
      return;
    }
    this.mapa.fitBounds(this.L.latLngBounds(puntos), {
      animate: false,
      paddingTopLeft: [26, 26],
      paddingBottomRight: [26, 26 + abajo],
    });
  }

  /** Resalta un marcador. La clave puede ser un id de lugar o la de un bloque. */
  destacar(clave) {
    if (this.destacado === clave) return;
    for (const [k, marcador] of this.marcadores) {
      const pin = marcador.getElement()?.querySelector('.pin');
      if (!pin) continue;
      pin.dataset.activo = String(k === clave);
    }
    this.destacado = clave;
  }

  irA(clave, { abrirGlobo = true } = {}) {
    const marcador = this.marcadores.get(clave);
    if (!marcador || !this.mapa) return;
    const zoomObjetivo = Math.max(this.mapa.getZoom(), 14);
    this.mapa.setView(marcador.getLatLng(), zoomObjetivo, { animate: true, duration: 0.45 });
    const abajo = this.margenInferior();
    if (abajo) this.mapa.panBy([0, abajo / 2], { animate: true });
    if (abrirGlobo) marcador.openPopup();
    this.destacar(clave);
  }

  marcarVisitado(lugarId, visitado) {
    const pin = this.marcadores.get(lugarId)?.getElement()?.querySelector('.pin');
    if (pin) pin.dataset.visitado = String(visitado);
  }

  // --- Ubicación ----------------------------------------------------------

  localizar() {
    return new Promise((resolver, rechazar) => {
      if (!navigator.geolocation) { rechazar(new Error('Este navegador no da la ubicación')); return; }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const punto = [coords.latitude, coords.longitude];
          if (this.marcadorYo) this.marcadorYo.setLatLng(punto);
          else {
            this.marcadorYo = this.L.marker(punto, {
              icon: this.L.divIcon({ className: 'marcador', html: '<div class="yo"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
              interactive: false,
              zIndexOffset: 1000,
            }).addTo(this.mapa);
          }
          this.mapa.setView(punto, Math.max(this.mapa.getZoom(), 15), { animate: true });
          resolver(punto);
        },
        (e) => rechazar(new Error(e.code === 1 ? 'Permiso de ubicación denegado' : 'No se ha podido obtener la ubicación')),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    });
  }

  // --- Preparar sin conexión ----------------------------------------------

  /**
   * Descarga las teselas de un recuadro en tres niveles de zoom para que el
   * service worker las guarde. Va acotado y lo lanza el usuario a propósito:
   * bajar teselas en masa va contra la política de uso de cualquier proveedor,
   * y aquí lo que se quiere es un día concreto, no medio país.
   */
  async prepararSinConexion(recuadro, { alProgreso = () => {} } = {}) {
    if (!this.mapa) return { descargadas: 0, total: 0 };
    const base = Math.round(this.mapa.getZoom());
    const niveles = [base - 1, base, base + 1].filter((z) => z >= 3 && z <= 17);

    let lista = [];
    for (const z of niveles) {
      lista = lista.concat(teselasDe(recuadro, z));
      if (lista.length > MAX_TESELAS_SIN_CONEXION) break;
    }
    lista = lista.slice(0, MAX_TESELAS_SIN_CONEXION);

    // El subdominio y el sufijo de retina se calculan **exactamente** como los
    // calcula Leaflet al pedir la tesela. Si no, se descarga `a.basemaps…` y
    // luego se pide `c.basemaps…`: son URLs distintas, la caché no acierta, y el
    // mapa aparece en blanco justo el día que no hay cobertura. Esto costó una
    // ronda entera de depuración.
    const sub = this.capaTeselas.options.subdomains;           // 'abcd'
    const escala = this.capaTeselas.options.detectRetina && (globalThis.devicePixelRatio || 1) > 1 ? '@2x' : '';
    const urls = lista.map(({ x, y, z }) =>
      TESELAS.claro
        .replace('{s}', sub[Math.abs(x + y) % sub.length])
        .replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{r}', escala));

    // Los dos temas, para que cambiar de claro a oscuro sin cobertura no deje
    // el mapa en blanco.
    const oscuras = urls.map((u) => u.replace('/voyager/', '/dark_all/'));
    const todas = urls.concat(oscuras);

    let hechas = 0;
    const CONCURRENCIA = 6;
    const cola = todas.slice();

    async function obrero() {
      while (cola.length) {
        const url = cola.shift();
        try { await fetch(url, { mode: 'cors', cache: 'force-cache' }); } catch { /* una tesela suelta no importa */ }
        hechas += 1;
        alProgreso(hechas, todas.length);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCIA }, obrero));
    return { descargadas: hechas, total: todas.length };
  }

  /**
   * Pone el mapa en modo «el siguiente toque elige un punto».
   * Es la vía que funciona sin conexión y la que sirve cuando no sabes cómo se
   * llama el sitio: el mirador ese de la carretera no está en ningún buscador.
   */
  elegirPunto(alElegir) {
    if (!this.mapa) return () => {};
    const contenedor = this.mapa.getContainer();
    contenedor.classList.add('mapa--eligiendo');

    const alTocar = (e) => {
      cancelar();
      alElegir([Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5))]);
    };
    const alEscape = (e) => { if (e.key === 'Escape') cancelar(); };

    const cancelar = () => {
      contenedor.classList.remove('mapa--eligiendo');
      this.mapa.off('click', alTocar);
      removeEventListener('keydown', alEscape);
    };

    this.mapa.on('click', alTocar);
    addEventListener('keydown', alEscape);
    return cancelar;
  }

  destruir() {
    this.mapa?.remove();
    this.mapa = null;
    this.marcadores.clear();
  }
}
