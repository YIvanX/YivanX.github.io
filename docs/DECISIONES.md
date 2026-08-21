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

## Las fotos se guardan, no se enlazan

Una foto por lugar, de Wikimedia Commons y con licencia libre, **descargada al
repositorio**. Enlazar a `upload.wikimedia.org` habría sido gratis en espacio y
habría roto lo mismo que rompería un CDN: sin conexión no hay fotos, y encima
depende de que una URL ajena siga viva. 21 imágenes a 500 px son 1,5 MB, y el
service worker las precachea al instalar.

**Detalle de Commons que cuesta una tarde:** solo sirve los tamaños que ya
tiene generados. Pedir 640 px devuelve **HTTP 400**; pedir 480 por la API
devuelve un 500 px que sí existe. Y limita el ritmo con 429, así que hay que ir
despacio y reintentar.

**`credito` es obligatorio y el validador lo comprueba.** Las licencias CC
exigen atribución: va bajo cada foto y, completa, en la sección de créditos.

## Editar el itinerario sin backend: una capa, no una edición

Añadir y quitar paradas ocurre en el navegador, en una **capa** que se superpone
al JSON al cargar. **El archivo del viaje no se modifica nunca.**

- Es un sitio estático: no hay nada que pueda escribir en el repositorio.
- **Quitar es ocultar, no borrar.** Se restaura con un botón, y una edición
  futura del JSON no entra en conflicto con lo que hiciste sobre la marcha.
- Funciona sin conexión, igual que las notas y las fotos.

Lo ocultado se identifica por **fecha + hora + a qué apunta**, nunca por índice:
en cuanto añades una parada a mitad del día los índices se corren y lo ocultado
saltaría a otro bloque. Hay una prueba dedicada a eso.

Toda la lógica vive en `js/personalizacion.js`, que es **puro** —ni DOM ni
localStorage— y por eso se prueba entero en Node. Es lo que decide qué aparece
en el itinerario: un fallo ahí no da error, hace desaparecer una parada.

Cuando un cambio merezca ser permanente, «Copiar como JSON» lo deja listo para
pegar en `data/viajes/<id>.json`. Ese es el puente entre lo efímero y el
repositorio.

## Cuatro pestañas hermanas que no eran hermanas

La primera versión ponía `Itinerario · Transporte · Listas · Viaje` en una barra
de pestañas, todas al mismo nivel. No lo estaban:

- **Itinerario** era **un día**.
- **Transporte** y **Listas** eran tablas del **viaje entero**.
- **Viaje** era el viaje que **contiene** a las otras tres, más la cuenta de
  Supabase, más los créditos de las fotos.

La prueba estaba en la propia interfaz: la barra de días desaparecía en tres de
las cuatro pestañas. La aplicación ya sabía la jerarquía correcta y la barra la
negaba.

Ahora la jerarquía la lleva la cabecera, con **un icono por destino**: la maleta
sube a la portada del viaje y la persona lleva a Tus datos. De la portada cuelgan
el itinerario, Transporte, Listas, Preparativos y Al volver. No hay barra de
pestañas.

**Los iconos no son adorno, son la corrección de un fallo medido.** La primera
versión dejaba el acceso a la portada solo en el título de la cabecera: un
objetivo táctil de **37 × 26 px**, la mitad del mínimo de 44. Con su icono
propio, y con el título convertido en un objetivo de 44 px de alto, el acceso
pasa a existir de verdad. El icono lleva `aria-current="page"` cuando ya estás
en la portada, para que no invite a ir a donde ya estás.

**El tema se fue a Tus datos.** Cinco objetivos táctiles en una cabecera de 52 px
no caben, y un icono que cicla entre automático, claro y oscuro obliga a
**deducir** en cuál de los tres estás. En Tus datos son tres botones con su
nombre escrito. Se pierde el cambio de tema en un toque; a cambio, «automático»
—que es el de fábrica— ya sigue al móvil, que de noche cambia solo.

**Se entra por el día, no por la portada.** La jerarquía dice que el viaje
contiene al día, pero durante el viaje esto se abre veinte veces al día para ver
qué toca ahora, y ese gesto no puede costar un toque más. Subir es lo que cuesta
un toque, y se hace pocas veces.

**Portada, Transporte y Listas no montan una vista aparte.** Se pintan dentro de
`montarViaje` y solo ensanchan el panel por CSS. Sacarlas fuera habría destruido
y reconstruido el mapa en cada ida y vuelta, que es justo lo que evita el resto
del diseño de esa vista.

## Un aviso se lee el día que importa, no antes

`avisos[]` y `listas[]` llevan dos campos opcionales, `dias` y `momento`. Sin
ninguno de los dos, la entrada es del viaje y se comporta igual que siempre: es
lo que hace que el cambio no rompa ningún archivo existente.

El motivo es medible. De los seis avisos del viaje a León, **cuatro hablan de un
día concreto** —el peaje de la AP-71, los dos aparcamientos de Las Médulas, la
reserva de Valporquero, la ventana del coche de alquiler— y se enseñaban todos
juntos en una pestaña que se visita dos veces y nunca cuando hacen falta.

Dentro del día van en **bandas plegables**, no en sub-pestañas. Una cuarta fila
de navegación sobre una hoja que asoma 132 px no deja sitio para el plan, que es
lo que se está mirando. Son `<details>` nativos: sin estado en JS, con teclado, y
**siempre cerradas** — una banda que se abre sola se come lo que asoma.

Lo que decide qué pertenece a qué vive en `js/agenda.js`, **puro y con pruebas**,
por lo mismo que `personalizacion.js`: un fallo ahí no da error, esconde un
aviso, y eso no se echa de menos hasta que estás delante de la taquilla cerrada.
El validador comprueba además que cada fecha caiga dentro del viaje.

## Transporte se calcula, no se escribe

La tabla `transporte[]` tenía 7 entradas en el viaje a León y **5 duplicaban a
mano bloques `traslado` que ya estaban en los días**. Ya habían empezado a
divergir: una decía «Ponferrada → León» cuando el bloque real de ese día salía de
Villafranca.

Ahora la vista Transporte sale de los bloques de traslado: fecha, hora, modo,
origen, destino, duración real y enlace a Maps. Es más de lo que tenía la tabla y
no puede desviarse. En `transporte[]` queda lo que **no** es un tramo de un día —
el alquiler del coche, un abono— y se enseña como «Contratos y reservas», que es
lo que de verdad es y por eso también aparece en Preparativos.

## Preparativos y Al volver no son días

Son dos pestañas más en la barra de días, con ruta propia (`/d/pre`, `/d/post`),
pero **no entran en `viaje.dias`**. Ese array va indexado por fecha en todas
partes —el orden, `diasEntre`, el día por defecto, las flechas del teclado— y una
entrada con `fecha: "pre"` habría roto el orden y el día al que se entra.

«Al volver» solo aparece si tiene algo dentro o si el viaje está completado. Una
pestaña vacía los seis días es peor que no tenerla.

## La cuenta no es del viaje

`#/perfil` —«Tus datos»— tiene la sesión, el id para invitar, el estado de la
conexión, el tema, lo que ocupa Bitácora en el navegador y, **por cada viaje, sus
datos privados y sus recuerdos**. La portada del viaje tiene si **ese** viaje
está sincronizado, en qué versión y cuántos cambios faltan por subir.

El corte que decide qué va dónde:

- **El viaje es lo público.** Sale del JSON del repositorio y lo ve igual
  cualquiera con quien lo compartas: días, avisos, presupuesto, transporte.
- **Tus datos es lo privado.** Vive solo en este navegador y no sube nunca: la
  dirección del alojamiento, las referencias de reserva, las notas, las fotos, y
  quién eres para la nube.

Por eso los datos privados **no pueden** estar en la pantalla del viaje: el
repositorio es público, un itinerario ya dice qué días no hay nadie en casa, y la
dirección exacta no puede vivir al lado de eso ni siquiera visualmente.

Estaban en la misma caja y por eso no se leía ninguna: «¿he iniciado sesión?» y
«¿está este viaje en la nube?» son preguntas distintas. Y lo que ocupa el
navegador es del origen, no de un viaje: decirlo dentro de uno era mentir por
encuadre.

Exportar los recuerdos vive **en un solo sitio**. «Al volver» enlaza a Tus datos
en vez de tener su propio botón: dos implementaciones de lo mismo son dos sitios
donde arreglar el mismo fallo.

## La barra de días son enlaces, no pestañas

Eran `<button role="tab">` dentro de un `role="tablist"` sin un solo
`tabpanel` — ARIA que describía algo que no existía. Y cada día **es** una URL.

Ahora son `<a href="#/v/<viaje>/d/<fecha>">` con `aria-current="page"`. Sale
gratis lo que antes habría habido que programar: abrir un día en otra pestaña,
copiar su enlace, recorrer la barra con el tabulador. El manejador de click se
queda solo con el efecto que el enlace no puede hacer — apagar «ver todo el
viaje», porque elegir un día es decir que quieres mirar ese día.

## Deslizar entre días

Con el dedo, cambiar de día obligaba a apuntar a una pestaña de 44 px en una
barra que además se desplaza. El gesto natural es el que ya hacían las flechas
del teclado.

Está construido con las mismas piezas que la hoja arrastrable, y la primera
versión las tenía todas mal:

- **`setPointerCapture` en cuanto se decide que el gesto es horizontal.** Sin
  captura, sacar el dedo del panel a mitad de arrastre mata el gesto. Va en ese
  momento y no en el `pointerdown` porque el panel es grande —no se pierde nada
  por empezar tarde— y capturar cada toque estorbaría a los botones de dentro.
- **Decide la velocidad, no la distancia.** Se proyecta a dónde iba el gesto con
  la misma función de inercia de la hoja y se decide sobre esa proyección.
  Medido: un golpe seco de **42 px** pasa de día, aunque el umbral sean 56.
- **Muelle en `requestAnimationFrame`, no transición de CSS.** Una transición no
  se puede agarrar a mitad: si vuelves a deslizar mientras el panel regresa, el
  muelle arranca del valor que hay en pantalla y hereda su velocidad.
- **Goma elástica en los topes.** El primer día no tiene anterior, y eso se dice
  resistiendo cada vez más, no parándose en seco.

**Solo con el dedo.** Con ratón, un arrastre horizontal es seleccionar texto, y
robárselo sería peor que no tener el gesto. Y el día nuevo entra por el lado del
que tiraste: si apareciera sin más, el desplazamiento no habría significado nada.

**Las flechas del teclado no animan.** Una flecha se repite muchas veces
seguidas, y animar cada repetición hace que el teclado se sienta lento. El gesto
sí anima, porque ahí la animación *continúa* un movimiento que ya existía.

El gesto nunca es la única vía: las pestañas de día y las flechas siguen ahí.

## La hoja inferior pide alto, no estrechez

El corte era `max-width: 899px` a secas, así que un móvil **apaisado** —844 × 390—
entraba en el modo hoja: ancho de sobra para dos columnas y casi nada de alto
para una hoja. Medido antes del arreglo: 118 px de los 390 se iban en cabecera y
barra de días, y el mapa quedaba en una tira detrás de la hoja.

Ahora la consulta es `(max-width: 899px) and (min-height: 500px)`, y **la exporta
`ui/hoja.js`** para que el CSS y el JS no puedan discrepar: si dijeran cosas
distintas, el JS estaría moviendo con `transform` un panel que el CSS ya no trata
como hoja. Por debajo de 500 px de alto se usan dos columnas, el panel se
estrecha a 320 px y la barra de días se aprieta a una sola línea.

**Y una trampa de CSS que costó un recorte invisible:** un elemento de rejilla
tiene `min-width: auto`, así que **no baja de su contenido mínimo**. Con el panel
a ancho completo y en flujo, a 320 px la cabecera se estiraba a 389 y `.app`
—que recorta— se comía el trozo de la derecha sin dejar ni barra de scroll. Se
arregla con `min-width: 0` en `.escenario` y en `.panel`.

## Photon para buscar sitios, no Google Places

**Google Places queda descartado por una razón concreta:** exige clave de API y
facturación, y una clave metida en un sitio estático y público es una clave
regalada.

**Photon** (komoot) es un geocodificador sobre datos de OpenStreetMap, hecho para
autocompletar, con sesgo por coordenadas y `Access-Control-Allow-Origin: *`. Sin
clave y sin intermediario. **Nominatim** queda de reserva si Photon no responde.

**El sesgo de ubicación no es un adorno.** Buscando «catedral» sin él, el primer
resultado es la catedral de León de México. Con el centro del día como sesgo,
sale la de León y después la de Astorga. Comprobado antes de escribir la
interfaz.

Y hay una segunda vía que no depende de la red: **tocar el mapa**. Es la que
sirve sin cobertura y la que resuelve el mirador de la carretera que no está en
ningún buscador.

## Los enlaces de Google Maps salen de las coordenadas

Nunca del nombre. Buscar «Catedral de León» por texto devuelve la catedral de
Burgos, y «Estación de Ponferrada» devuelve una estación de esquí: pasó de
verdad al geocodificar este viaje. Con `?api=1&query=lat,lng` no hay ambigüedad.

La ruta de un día incluye **los extremos de los traslados**, no solo las
paradas: sin las estaciones, el miércoles parecería que se va de León a Las
Médulas de un salto.

**Limitación de Google, dicha en pantalla:** las paradas intermedias solo
existen en a pie, coche y bici — en transporte público no—. Un día con tren cae
a modo coche, y la interfaz lo explica en vez de dejar que parezca una
indicación real. Por encima de nueve paradas intermedias, la forma `?api=1` deja
de admitirlas y se usa la forma por segmentos (`/dir/a/b/c/`).

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

### Tipografía y copia

- **`text-wrap: balance` en los títulos** para que ninguno deje una palabra sola
  en la última línea, y `pretty` en la prosa, que hace lo mismo pero solo con la
  última línea y es lo barato de calcular en un párrafo largo.
- **Nada de «3 nota(s)».** Eso es lo que escribe un programa, no lo que escribe
  alguien, y esto se lee de pie en una plaza. Hay un `plural()` en `ui/dom.js`.
- **Los ceros no se pintan.** Una fila de «0 notas · 0 visitados · 0 fotos» no
  informa de nada y tapa el número que sí importa.
- **Un `h1` por pantalla**, el que ya lleva `data-foco`. Antes la vista de un día
  encabezaba con `h2` y no había ningún `h1`, porque el título del viaje es un
  `<span>` de la cabecera.

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
