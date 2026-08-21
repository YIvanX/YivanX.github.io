# Bitácora

Guía interactiva durante el viaje y registro de viajes después.

**https://yivanx.github.io/**

Un viaje es un archivo JSON. La web es el motor que lo pinta: no hay ni un
destino escrito en el código, así que el siguiente viaje no toca ni una línea.

---

## Qué hace

- **Cronología del día y mapa sincronizados.** Pasar por un bloque resalta su
  marcador; tocar un marcador lleva al bloque. Las paradas van numeradas en el
  orden real del día y unidas por el trazo del recorrido.
- **Dice si un sitio está abierto ese día concreto a esa hora**, calculado
  contra su horario por día de la semana. Un lugar cerrado sale marcado en rojo
  en la propia cronología. Es la función que evita plantarse ante una puerta
  cerrada.
- **Funciona sin conexión.** Aplicación instalable, con un botón por día que
  descarga las teselas de ese recuadro. Verificado con la red cortada: la guía
  y el mapa siguen ahí.
- **El itinerario se edita sobre la marcha**: buscador de sitios sobre el mapa
  para añadir paradas, y quitarlas de un día sin perderlas. Lo añadido vive en el
  navegador; el JSON del viaje no se toca, y hay un botón para llevarlo al
  archivo cuando merezca ser permanente.
- **Cada sitio se lee, no se estudia**: un gancho de una línea, prosa corta,
  una lista de **qué mirar** que se va marcando estando allí, y los datos
  curiosos en tarjetas sueltas en vez de enterrados en un párrafo.
- **Una foto por sitio**, en la fila del itinerario, en el globo del mapa y como
  cabecera de su ficha. Guardadas en el repositorio, así que **también se ven sin
  conexión**. De Wikimedia Commons, con su autor y su licencia a la vista.
- **Enlaces a Google Maps**: cada día tiene su ruta completa con las paradas en
  orden, y cada sitio el suyo propio, tanto en la fila del itinerario como en su
  ficha. Todo por coordenadas, nunca por nombre.
- **Marcar visitado, tomar notas y adjuntar fotos**, que se quedan en el
  dispositivo y se pueden exportar a un archivo.
- **Cada cosa en su nivel.** El viaje tiene su portada —con su icono en la
  cabecera—, de ella cuelga el itinerario, y **cada día lleva encima lo suyo**:
  sus avisos, los traslados de ese día y su lista, en bandas que se despliegan
  sin salir del plan. Antes del primer día hay **Preparativos** y después del
  último, **Al volver**.
- **Se pasa de día deslizando**, además de con las pestañas y las flechas. El
  gesto decide por la velocidad y no por la distancia, así que un golpe seco
  corto basta, y el panel acompaña al dedo mientras arrastras.
- **El transporte se calcula del itinerario**, no se escribe aparte: fecha, hora,
  modo, origen, destino, duración y enlace a Maps salen de los propios traslados,
  así que no pueden decir algo distinto del día. Lo que se contrata o se reserva
  —el coche de alquiler, un abono— va aparte, en Preparativos.
- Listas de reservas y equipaje con su progreso, presupuesto, avisos de lo que
  puede romper el viaje, y buscador con `Ctrl+K`.
- Tema claro y oscuro, incluido el mapa.

## Nube, opcional

Con Supabase configurado, el viaje y el estado personal se sincronizan entre
dispositivos y se puede compartir con otra persona.

**`#/perfil` — «Tus datos» — es todo lo que es tuyo y no del viaje**: la cuenta,
el tema, lo que ocupa el navegador y, por cada viaje, sus datos privados y sus
recuerdos. El viaje es lo público, que sale del repositorio; Tus datos es lo
privado, que no sale del navegador. Si **este** viaje está sincronizado y en qué
versión, eso sí está en la portada del viaje. **Sin configurar, o con
Supabase caído, la aplicación funciona exactamente igual** leyendo el repositorio
y guardando en el navegador: la nube es la fuente, el repositorio es el suelo.

El esquema completo con sus políticas está versionado en
`supabase/migraciones/`, y el paso a paso en **[supabase/LEEME.md](supabase/LEEME.md)**.

## Qué necesita

Nada. Ni dependencias, ni `npm install`, ni compilación. Node solo hace falta
para las herramientas de línea de comandos.

---

## Uso

```bash
node herramientas/servir.mjs                 # http://localhost:8080/
node herramientas/validar.mjs                # revisa todos los viajes
npm run probar                               # 101 pruebas: horarios, capa, nube, sincronización, agenda

node herramientas/nuevo-viaje.mjs <id> "<Título>" <inicio> <fin> [--desde <viaje>]
node herramientas/coordenadas.mjs --area "<ciudad>" "<lugar>"…
node herramientas/fotos.mjs <viaje>
```

Las tres últimas son las que quitan el trabajo pesado de montar un viaje:
coordenadas verificadas, una foto por lugar con su licencia, y arrancar
heredando las listas del viaje anterior.

Con `file://` no funciona: los módulos ES y el service worker necesitan un
origen de verdad.

## Añadir un viaje

**[docs/COMO-CREAR-UN-VIAJE.md](docs/COMO-CREAR-UN-VIAJE.md)** — el paso a paso,
incluido cómo sacar coordenadas que no estén equivocadas.

Por qué está construido así: **[docs/DECISIONES.md](docs/DECISIONES.md)**.

---

## Estructura

```
index.html              armazón y juego de iconos SVG
css/                    base (tokens y tipografía) · componentes · mapa
js/
  app.js                enrutado por hash y arranque
  datos.js              carga y normaliza los JSON
  agenda.js             qué aviso, lista o tramo va en qué día (puro, con pruebas)
  estado.js             localStorage + IndexedDB (visitados, notas, fotos)
  horarios.js           ¿está abierto? — compartido con el validador
  mapa.js               envoltorio de Leaflet
  enlaces-mapa.js       rutas y enlaces de Google Maps
  personalizacion.js    capa de paradas añadidas y quitadas (puro, con pruebas)
  nube.js               Supabase por HTTP plano, sin SDK. Opcional
  vistas/               registro · perfil · viaje · panel
  ui/                   dom · hoja arrastrable · buscador · buscar-lugar · tema · avisos
                        (dom.js exporta el muelle, la proyección de inercia y la
                         goma elástica que usan la hoja y el gesto de cambiar de día)
vendor/leaflet/         Leaflet 1.9.4, local
data/
  viajes.json           el registro
  viajes/<id>.json      un viaje
  viajes/_plantilla.json
schema/                 el contrato de un viaje
supabase/migraciones/   el esquema SQL, versionado. Fuente de verdad
herramientas/           validar · probar · servir
                        nuevo-viaje · coordenadas · fotos
sw.js                   service worker
```

---

## Aviso de privacidad

**Este repositorio es público.** Todo lo que entre en `data/` lo puede leer
cualquiera, y un itinerario dice qué días no hay nadie en casa.

Direcciones exactas, referencias de reserva y teléfonos van al panel
**Tus datos** (el icono de persona), que guarda solo en el navegador. Las fotos viven en
IndexedDB y publicar una es una decisión explícita.

---

## Créditos

Mapas de [CARTO](https://carto.com/attributions) sobre datos de
[OpenStreetMap](https://www.openstreetmap.org/copyright).
[Leaflet](https://leafletjs.com) 1.9.4, BSD-2-Clause.
Los datos de los viajes son propios, con su fuente y su fecha de verificación
anotadas lugar por lugar.

La web anterior de este repositorio se conserva en la rama `archivo-ramen`.
