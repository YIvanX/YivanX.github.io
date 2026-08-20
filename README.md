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
- **Una foto por sitio**, en la fila del itinerario, en el globo del mapa y como
  cabecera de su ficha. Guardadas en el repositorio, así que **también se ven sin
  conexión**. De Wikimedia Commons, con su autor y su licencia a la vista.
- **Enlaces a Google Maps**: cada día tiene su ruta completa con las paradas en
  orden, y cada sitio el suyo propio, tanto en la fila del itinerario como en su
  ficha. Todo por coordenadas, nunca por nombre.
- **Marcar visitado, tomar notas y adjuntar fotos**, que se quedan en el
  dispositivo y se pueden exportar a un archivo.
- Transporte tramo a tramo, listas de reservas y equipaje con su progreso,
  presupuesto, avisos de lo que puede romper el viaje, y buscador con `Ctrl+K`.
- Tema claro y oscuro, incluido el mapa.

## Qué necesita

Nada. Ni dependencias, ni `npm install`, ni compilación. Node solo hace falta
para las herramientas de línea de comandos.

---

## Uso

```bash
node herramientas/servir.mjs                 # http://localhost:8080/
node herramientas/validar.mjs                # revisa todos los viajes
node --test herramientas/horarios.test.mjs   # pruebas de la lógica de horarios

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
  estado.js             localStorage + IndexedDB (visitados, notas, fotos)
  horarios.js           ¿está abierto? — compartido con el validador
  mapa.js               envoltorio de Leaflet
  enlaces-mapa.js       rutas y enlaces de Google Maps
  vistas/               registro · viaje · panel
  ui/                   dom · hoja arrastrable · buscador · tema · avisos
vendor/leaflet/         Leaflet 1.9.4, local
data/
  viajes.json           el registro
  viajes/<id>.json      un viaje
  viajes/_plantilla.json
schema/                 el contrato de un viaje
herramientas/           validar · probar · servir
                        nuevo-viaje · coordenadas · fotos
sw.js                   service worker
```

---

## Aviso de privacidad

**Este repositorio es público.** Todo lo que entre en `data/` lo puede leer
cualquiera, y un itinerario dice qué días no hay nadie en casa.

Direcciones exactas, referencias de reserva y teléfonos van al panel
**Viaje → Datos privados**, que guarda solo en el navegador. Las fotos viven en
IndexedDB y publicar una es una decisión explícita.

---

## Créditos

Mapas de [CARTO](https://carto.com/attributions) sobre datos de
[OpenStreetMap](https://www.openstreetmap.org/copyright).
[Leaflet](https://leafletjs.com) 1.9.4, BSD-2-Clause.
Los datos de los viajes son propios, con su fuente y su fecha de verificación
anotadas lugar por lugar.

La web anterior de este repositorio se conserva en la rama `archivo-ramen`.
