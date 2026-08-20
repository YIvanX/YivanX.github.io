# Decisiones

Por qué está construido así. Escrito para el que vuelva dentro de dos años —
que probablemente seré yo — y no se acuerde de por qué algo parece raro.

---

## Sin framework y sin paso de compilación

HTML, CSS y módulos ES nativos. Sin npm, sin bundler, sin React.

- GitHub Pages sirve estáticos. Un build sería infraestructura que mantener a
  cambio de nada.
- Esto tiene que seguir funcionando dentro de años. Un `npm install` de 2026 no
  se ejecuta limpio en 2030; un `<script type="module">` sí.
- El JSON de un viaje se puede editar a mano, sin arrancar nada.

`package.json` existe **solo** para que Node trate los `.js` como módulos ES y
las herramientas puedan importar el mismo `js/horarios.js` que usa el navegador.
No tiene dependencias y no hay que instalar nada.

## El viaje es un dato, no código

Ni un nombre de León en `js/`. La aplicación pinta lo que le den; un viaje nuevo
es un JSON nuevo. Es lo único que hace falta para que esto sirva para el
siguiente viaje sin tocarlo.

## `horarios.js` lo comparten el navegador y el validador

La respuesta a «¿está abierto esto ahora?» se calcula en un solo sitio. Si
hubiera dos implementaciones, un día dirían cosas distintas y el error se
descubriría delante de una puerta cerrada.

## Leaflet vendorizado, no por CDN

`vendor/leaflet/` con la 1.9.4 dentro. Un CDN rompe el modo sin conexión —que es
el motivo de existir de media aplicación— y además es una dependencia de red que
puede caerse o cambiar. Se carga bajo demanda: la portada no necesita mapa y no
paga sus 147 KB.

## Teselas de CARTO, y el subdominio importa

Basemaps de CARTO (Voyager en claro, Dark Matter en oscuro) sobre datos de
OpenStreetMap. Atribución obligatoria y visible: no se esconde.

**El detalle que costó una ronda de depuración:** la descarga para uso sin
conexión tiene que construir la URL de cada tesela **exactamente** como la
construye Leaflet al pedirla, subdominio incluido. Leaflet elige el subdominio
con `(x + y) % n`; la primera versión los repartía en ciclo. Resultado: se
descargaba `a.basemaps…` y luego se pedía `c.basemaps…`. Son URLs distintas, la
Cache API no acierta, y el mapa aparecía en blanco justo el día sin cobertura.
Medido: 0 teselas offline antes del arreglo, 20 después.

## La descarga sin conexión va acotada y la lanza el usuario

Un botón por día, un recuadro, tres niveles de zoom, tope de 420 teselas por
tema. Bajar teselas en masa va contra la política de uso de cualquier proveedor
y aquí no hace falta: lo que se quiere es un día concreto, no medio país.

Las teselas sobreviven a los cambios de versión de la aplicación a propósito
(caché aparte, con expulsión de las más viejas al llegar a 3.000). Volver a
descargar el mapa de un viaje ya preparado sería lo contrario de lo que se busca.

## Rutas por hash

`#/v/leon-2026-08/d/2026-08-30`. GitHub Pages no reescribe rutas, así que
`/v/leon-2026-08` daría 404 al recargar. Con hash, la URL se comparte y se
recarga sin necesitar nada del servidor.

## El estado personal nunca entra en el repositorio

El repositorio es **público**. Lo visitado, las notas y los datos privados van a
`localStorage`; las fotos a IndexedDB comprimidas a 1600 px. Nada de eso sube.
Hay exportar e importar a archivo porque un navegador limpio se lleva por
delante las dos cosas, y un recuerdo de viaje no puede depender de eso.

Publicar una foto es un acto explícito: copiarla a `data/viajes/<id>/fotos/` y
referenciarla desde el lugar.

## `.nojekyll`

GitHub Pages sirve este repositorio en modo *legacy*, o sea con Jekyll delante.
Sin ese archivo, Jekyll procesa el sitio y se come cualquier cosa que empiece
por `_` — como `data/viajes/_plantilla.json`.

---

## Diseño

Monocromo cálido y editorial. **El color solo significa dos cosas**: categoría
de lugar y estado (abierto / cerrado / visitado). No decora nunca. Esto se usa
andando, con una mano, y a veces sin cobertura: manda la densidad y la
legibilidad, no el aire.

Tipografía del sistema, sin fuente web. Una fuente descargada rompería el modo
sin conexión y metería una dependencia externa en algo pensado para durar. El
contraste tipográfico sale de mezclar la serif del sistema con la sans, no de
comprar una familia.

### Movimiento

Criterio tomado de las skills de Emil Kowalski y de las charlas de diseño de
Apple, leídas enteras antes de escribir CSS:

- **Curvas propias**, nunca las de serie: `cubic-bezier(0.23, 1, 0.32, 1)` para
  salidas. **Nunca `ease-in`** en interfaz — retrasa el arranque justo en el
  instante que el ojo mira.
- Nada por encima de 300 ms. Pulsación 120 ms, desplegables 160-220 ms.
- `scale(0.97)` al pulsar, en todo lo pulsable. Nada entra desde `scale(0)`.
- Hover solo tras `@media (hover: hover) and (pointer: fine)`: en táctil, el
  hover se dispara al tocar y da falsos positivos.
- **El buscador no tiene animación de apertura.** Se abre con teclado y se usa
  muchas veces: cualquier transición lo haría sentir lento.
- `prefers-reduced-motion`, `prefers-reduced-transparency` y `prefers-contrast`
  atendidos. Movimiento reducido no es «sin movimiento»: se conserva la opacidad,
  que ayuda a entender, y se quita el desplazamiento, que es lo que marea.

### La hoja arrastrable

La pieza donde se juega que esto se sienta bien:

- Seguimiento 1:1 respetando por dónde se agarró.
- **Proyección de inercia** de Apple (`v/1000 · d/(1−d)`, `d = 0.998`): al soltar
  va al anclaje más cercano a donde el gesto *iba*, no a donde estaba el dedo.
  Es lo que hace que un golpe seco la lance en vez de dejarla a medias.
- Muelle en `requestAnimationFrame` en vez de transición CSS, porque una
  transición no se puede agarrar a mitad: el muelle arranca del valor que hay en
  pantalla y hereda la velocidad.
- Goma elástica en los topes.
- **`setPointerCapture` en el `pointerdown`, no después de la histéresis.** El
  tirador mide 28 px y el primer movimiento ya saca el puntero de él: capturando
  más tarde, el gesto se perdía nada más empezar. Fue un bug real.
- **Solo se arrastra desde el tirador.** Arrastrar también desde el cuerpo obliga
  a pelearse con el scroll nativo de la lista, y esa pelea la pierde siempre
  alguien: o el itinerario no se recorre con el dedo, o la hoja no se cierra.
- Tras arrastrar, el navegador dispara igualmente un `click`. Sin guardián, ese
  click deshacía el gesto recién hecho.

### Un helper de plantillas que escapa por defecto

`html\`\`` escapa todo lo que entre por `${}`. Lo ya montado se marca con la
clase `Crudo` — que es una clase y no un texto con marca, precisamente porque la
primera versión no sabía distinguir una plantilla anidada de texto del usuario y
pintaba los `<button>` como prosa en la página.

Un booleano suelto **no pinta nada** (para que `${cond && html\`…\`}` funcione),
así que un atributo tipo `aria-pressed="${x}"` necesita `String(x)`. Se olvidó
una vez y los atributos salían vacíos.
