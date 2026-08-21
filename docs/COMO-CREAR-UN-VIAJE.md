# Cómo crear un viaje

Bitácora no sabe nada de ningún destino. **Un viaje es un archivo JSON**; la web
es el motor que lo pinta. Añadir un viaje nuevo no toca ni una línea de código.

---

## 1. Crear el esqueleto

```bash
node herramientas/nuevo-viaje.mjs <id> "<Título>" <AAAA-MM-DD> <AAAA-MM-DD>
```

```bash
node herramientas/nuevo-viaje.mjs oporto-2027-05 "Oporto" 2027-05-14 2027-05-20
```

Con `--desde <viaje>` arranca heredando lo que de verdad se repite: **las listas**
—activar el bono de tren, la chaqueta, la batería externa— y **los conceptos del
presupuesto**, sin importes. No hereda lugares, días ni transporte: eso es del
destino, y copiarlo solo daría trabajo de borrado.

```bash
node herramientas/nuevo-viaje.mjs oporto-2027-05 "Oporto" 2027-05-14 2027-05-20 --desde leon-2026-08
```

Eso crea `data/viajes/oporto-2027-05.json` con un día por fecha, la carpeta de
fotos, y **da de alta el viaje en `data/viajes.json`** — que es el paso que
siempre se olvida cuando se hace a mano, y sin el cual el viaje existe pero no
aparece en la portada.

La referencia campo a campo está en **`data/viajes/_plantilla.json`**, comentada
por dentro. El contrato formal, en `schema/viaje.schema.json`.

---

## 2. Rellenar los lugares

Un lugar se define **una vez** en `lugares[]` y se referencia desde los días por
su `id`. Visitarlo dos veces el mismo día es normal y está previsto: en el mapa
sale un único marcador con los dos números (`1·3`).

```json
{
  "id": "catedral-leon",
  "nombre": "Catedral de León",
  "categoria": "patrimonio",
  "zona": "León capital",
  "coords": [42.59946, -5.56668],
  "resumen": "Una línea. Es lo que se lee en la cronología y en el mapa.",
  "descripcion": "El texto largo, en markdown ligero.",
  "duracionMin": 90,
  "precio": { "importe": 7, "detalle": "General con audioguía" },
  "horarios": { "lun": [["09:30","13:30"],["16:00","20:00"]], "dom": [["09:30","11:30"]] },
  "verificado": { "fecha": "2026-08-20", "fuente": "catedraldeleon.org" }
}
```

### Las coordenadas no se ponen de memoria

Es la regla que más disgustos ahorra. Al montar el viaje a León, pedir
«Catedral de León» a un geocodificador devolvió **la catedral de Burgos**, y
«Estación de Ponferrada» devolvió **una estación de esquí**. Seis de veintiséis
salieron mal a la primera.

**Hay una herramienta que hace esto:**

```bash
node herramientas/coordenadas.mjs --area "León, España" "Catedral de León" "Casa Botines"
node herramientas/coordenadas.mjs --area "Ponferrada" --tipo estacion "Ponferrada"
```

Acota por recuadro y **enseña varios candidatos con su etiqueta de OSM**, que es
lo que deja ver de un vistazo que lo que te ha devuelto es un `leisure/pitch` y
no la iglesia que buscabas. Añade `--json` para sacarlo pegable.

A mano, si hace falta:

- **Nominatim** acotando el área, que es lo que arregla la mayoría de los fallos:
  ```
  https://nominatim.openstreetmap.org/search?format=jsonv2&bounded=1&viewbox=<oeste>,<norte>,<este>,<sur>&q=<consulta>
  ```
- **Overpass** para lo que tiene etiqueta propia — estaciones, miradores, cimas —
  que es mucho más fiable que buscar por nombre:
  ```
  [out:json];node["railway"="station"](<sur>,<oeste>,<norte>,<este>);out body;
  ```
- O a mano en `openstreetmap.org`: botón derecho → «¿Qué hay aquí?».

El validador avisa si un lugar cae a más de 150 km del centro del viaje y da
error a más de 300 km. Así es como se cazan las que se han colado.

### Horarios

Por día de la semana. Un día **ausente** significa cerrado; si el objeto
`horarios` no existe, el lugar se considera siempre accesible (una plaza, una
muralla, un mirador sin taquilla).

```json
"horarios": {
  "mar": [["10:00","14:00"],["16:00","19:00"]],
  "dom": [["10:00","14:00"]]
}
```

Para cerrar a medianoche, `"24:00"`. Las franjas que cruzan las doce se
entienden solas: `["19:30","01:00"]`.

---

## 3. Montar los días

Tres tipos de bloque:

| Tipo | Para qué | Campos propios |
|---|---|---|
| `visita` (por defecto) | Estar en un sitio | `lugar` |
| `traslado` | Ir de un sitio a otro | `modo`, `desde`, `hasta` |
| `hito` | Algo que pasa y no es un sitio | `titulo` |

```json
{ "inicio": "09:30", "fin": "11:15", "lugar": "catedral-leon", "nota": "Hay que entrar a las 9:30." },
{ "tipo": "traslado", "inicio": "11:15", "fin": "11:25", "modo": "a-pie", "desde": "catedral-leon", "hasta": "san-isidoro", "detalle": "700 m" }
```

**`exterior: true`** para ver algo por fuera: una fachada iluminada de noche, un
edificio del que solo se mira el exterior. El horario de taquilla no se le
aplica, y en la cronología sale como «Por fuera» en vez de como cerrado.

**Los traslados no se escriben dos veces.** La vista Transporte se calcula de
estos bloques: fecha, hora, modo, origen, destino, duración y enlace a Maps salen
de aquí. No hace falta repetirlos en `transporte[]`, y repetirlos es peor que no
hacerlo, porque en cuanto cambias uno el otro miente. Lo que sí va en
`transporte[]` es lo que **no** es un tramo de un día: el alquiler del coche, un
abono, un billete de avión con su localizador.

### Decir a qué día pertenece un aviso o una lista

Un aviso sin más sale en la portada del viaje, y ahí se lee una vez y ya. Con
`dias` sube **dentro de ese día del itinerario**, que es donde de verdad hace
falta: el peaje de la AP-71 importa el día que se va a Astorga, no el día que
montas el JSON.

```json
{ "nivel": "medio", "titulo": "La AP-71 es de peaje", "texto": "…", "dias": ["2026-09-01"] }
{ "titulo": "Qué llevar", "momento": "pre", "items": [ … ] }
{ "titulo": "Lo de la excursión", "dias": ["2026-09-02"], "items": [ … ] }
```

| Qué pones | Dónde se lee |
|---|---|
| nada | la portada del viaje, o la pestaña Listas |
| `"dias": ["…"]` | dentro de cada uno de esos días, en una banda plegable |
| `"momento": "pre"` | Preparativos, la pestaña de antes del primer día |
| `"momento": "post"` | Al volver, la pestaña de después del último |
| los dos | en los dos sitios, a propósito |

Los dos campos valen igual para `avisos[]` y para `listas[]`. **Cada fecha tiene
que caer dentro del viaje**: el validador rechaza una que no, porque en pantalla
no daría error — haría desaparecer el aviso sin que nadie se enterase.

### Que se lea, no que se estudie

Un lugar tiene cuatro piezas de texto y cada una hace algo distinto. Escribirlas
todas como un párrafo largo es el error fácil.

| Campo | Qué es | Cómo se ve |
|---|---|---|
| `resumen` | **El gancho.** Una línea que dé una razón para ir | En la cronología y en el globo del mapa |
| `descripcion` | Qué es y por qué importa. Párrafos cortos | Prosa en la ficha |
| `queMirar` | Lo concreto que buscar **con los ojos** | Lista marcable, se tacha allí mismo |
| `curiosidades` | El dato que se cuenta luego | Tarjetas sueltas |

```json
"queMirar": [
  { "que": "El rosetón oeste", "porque": "Por la mañana está apagado; al caer la tarde arde." }
],
"curiosidades": [
  { "titulo": "Se cayó de verdad", "texto": "En 1631 se desplomó parte de la bóveda del crucero…" }
]
```

Tres reglas que salieron de escribir los 24 lugares de León:

- **`queMirar` no es `consejos`.** «Mira el pastor rascándose el pie» es qué
  mirar; «lleva chaqueta, hay 7 °C» es un consejo. Mezclarlos convierte las dos
  listas en ruido.
- **Un dato curioso que hay que leer dos veces deja de serlo.** El validador
  avisa por encima de 420 caracteres.
- **El `resumen` es lo que más se lee y lo que menos se cuida.** Aparece en cada
  fila del itinerario y en cada globo del mapa. Si es genérico, el día entero
  parece genérico.

---

### Cuánto duele saltárselo

`nivel` clasifica cada sitio en **obligatorio**, **recomendable** u **opcional**,
y se pinta el primero de todos los distintivos: es lo que decide si te lo saltas
cuando el día se ha torcido y son las siete de la tarde.

**No es criterio propio, y por eso `valoracion` no es opcional en la práctica:**
un nivel sin las cifras que lo sostienen es una opinión disfrazada de dato. El
validador avisa si falta.

```json
"nivel": "obligatorio",
"valoracion": {
  "nota": 4.7, "resenas": 5403,
  "puesto": "N.º 1 de las cosas que hacer en León",
  "fuente": "TripAdvisor, 20 de agosto de 2026"
}
```

El criterio que se usó en León, escrito para poder repetirlo:

| Nivel | Regla |
|---|---|
| **Obligatorio** | ≥ 4,5 y ≥ 800 reseñas, o cabeza del ranking de su localidad con mucho volumen |
| **Recomendable** | ≥ 4,2 con ≥ 200 reseñas, o ≥ 4,5 con volumen medio |
| **Opcional** | Por debajo, muy pocas reseñas, o no es un destino en sí |

**El volumen importa tanto como la nota.** Un 4,8 con 12 reseñas no dice nada;
un 4,2 con 1.588 sí. Y las notas bajas con mucho volumen son las que más
información dan: el MUSAC sale 3,5 sobre 293 reseñas, y eso es un consenso, no
un accidente.

Las páginas de TripAdvisor se dejan leer con WebFetch. Lo más rentable es pedir
la lista de atracciones de la localidad entera, que da nota, número de reseñas y
puesto de todas de una vez, en vez de ir sitio por sitio.

---

### Una foto por lugar

`imagen` es la foto que se ve en tres sitios: la fila del itinerario, el globo
del mapa y la cabecera de la ficha.

```json
"imagen": {
  "archivo": "data/viajes/leon-2026-08/fotos/catedral-leon.jpg",
  "credito": "David Jiménez Llanes",
  "licencia": "CC BY-SA 3.0",
  "fuente": "https://commons.wikimedia.org/wiki/File:Catedral_G%C3%B3tica_de_Le%C3%B3n.jpg"
}
```

**La foto se guarda en el repositorio, no se enlaza a un servidor ajeno.** Es lo
único que la hace funcionar sin conexión, y además no depende de que nadie
mantenga viva una URL. El service worker las precachea todas al instalar.

**Hay una herramienta que hace esto:**

```bash
node herramientas/fotos.mjs oporto-2027-05
node herramientas/fotos.mjs oporto-2027-05 --titulo museo="Museo Nacional Soares dos Reis"
```

Busca, descarga a 500 px, escribe crédito y licencia en el JSON sin reformatearlo,
y trae puestos dos guardias que salieron de ejecutarla contra León:

- **Se salta el alojamiento.** Es dato privado y el repositorio es público.
- **Rechaza banderas y escudos.** Los artículos de municipios tienen como imagen
  principal la bandera, no una foto del sitio: a la estación de Matallana le puso
  el pendón del ayuntamiento.

Cuando la imagen principal del artículo no sirve hay dos escapes, en este orden:

```bash
node herramientas/fotos.mjs <viaje> --titulo <id>="<otro artículo>"
node herramientas/fotos.mjs <viaje> --archivo <id>="Nombre exacto.jpg"
```

`--archivo` toma un archivo concreto de Commons y es la salida definitiva. Hizo
falta con la Plaza Mayor de Astorga: por nombre salía la bandera, y al cambiar de
artículo salía la misma foto que el museo de al lado. Para buscar el archivo:

```
https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srsearch=<lo que sea>
```

A mano, si hace falta — **Wikimedia Commons**, que es libre y tiene casi cualquier
monumento. La imagen principal del artículo de Wikipedia sale por API:

```
https://es.wikipedia.org/w/api.php?action=query&format=json&formatversion=2
  &prop=pageimages&piprop=thumbnail&pithumbsize=480&titles=<artículo>
```

Dos cosas aprendidas peleándose con eso:

- **Pide `pithumbsize=480`.** Commons solo sirve tamaños ya generados; pedir uno
  raro devuelve **HTTP 400**. 480 se resuelve a 500 px, que pesa unos 50-90 KB y
  sobra para un móvil. Las 21 imágenes de León ocupan 1,5 MB en total.
- **Va con límite de ritmo.** Deja un par de segundos entre peticiones y
  reintenta con espera creciente, o la mitad de las respuestas serán 429.

**`credito` es obligatorio** y el validador lo exige: una foto ajena sin
atribución no se puede publicar. Se muestra bajo la foto en la ficha y, entera,
en la sección «Créditos de las fotos» de la pestaña *Viaje*.

---

## Los enlaces de Google Maps se generan solos

No hay nada que configurar: salen de las coordenadas.

- **Por sitio** — un icono de chincheta en su fila del itinerario, y dos botones
  en su ficha: «Ver en Google Maps» y «Cómo llegar».
- **Por día** — un botón en la cabecera con **todas las paradas en el orden real
  del recorrido**, estaciones incluidas, porque sin ellas la ruta no se entiende.

Dos cosas que conviene saber:

- **Siempre por `lat,lng`, nunca por nombre.** Buscar «Catedral de León» por
  texto es exactamente lo que devuelve la catedral de Burgos.
- **Google no admite paradas intermedias en transporte público.** Un día con
  tren o bus sale en modo coche, y la aplicación lo dice en pantalla en vez de
  dejar que parezca una indicación real. Un día íntegramente a pie sale como tal.

Por encima de nueve paradas intermedias, la forma `?api=1` deja de admitirlas y
se cambia sola a la forma de ruta por segmentos (`/dir/a/b/c/`), que no tiene
ese tope.

---

## 4. Validar

```bash
node herramientas/validar.mjs oporto-2027-05
```

No es un linter de estilo: comprueba lo que de verdad rompe un viaje.

- Referencias rotas: un bloque que apunta a un lugar que no existe.
- **Que la visita cae dentro del horario de ese día de la semana.** Es la
  comprobación que evita plantarse delante de una puerta cerrada. Al montar el
  viaje a León cazó tres errores reales del itinerario.
- Que la visita no se pasa de la hora de cierre.
- Coordenadas fuera de rango, en `[0,0]`, o descolocadas respecto al resto.
- Fechas desordenadas, duplicadas o fuera del rango del viaje.
- Ids de tarea repetidos entre listas (se pisarían al guardarse).
- **Un `dias` de un aviso o de una lista que apunta fuera del viaje.** No daría
  error en pantalla: haría desaparecer el aviso, que es peor.
- Un `momento` que no sea `pre` ni `post`.
- Que el registro y los archivos de viaje dicen lo mismo.

---

## 5. Verlo

```bash
node herramientas/servir.mjs
```

`http://localhost:8080/#/v/oporto-2027-05`

Hace falta un servidor: con `file://` no funcionan ni los módulos ES ni el
service worker.

---

## 6. Publicarlo

```bash
git add -A && git commit -m "Viaje: Oporto 2027" && git push
```

GitHub Pages reconstruye solo. Un par de minutos.

---

## Editar el itinerario desde la aplicación

No hace falta tocar el JSON para probar un cambio. En la cabecera de cada día
hay **«Añadir una parada»**: busca el sitio sobre el mapa —o tócalo directamente
en el mapa, que funciona sin conexión— y lo mete en su hora. Desde la ficha de
cualquier parada se puede **quitar del día**, que la oculta sin borrarla.

Todo eso vive en el navegador. Cuando un cambio merezca ser permanente,
**la portada del viaje → Copiar como JSON** lo deja listo para pegar en el archivo del viaje.

Ese es el flujo recomendado para montar un viaje nuevo: bosquejarlo en la
aplicación con el mapa delante, y volcar al JSON cuando esté.

---

## Qué NO se pone en el JSON

**El repositorio es público.** Todo lo que se escriba en `data/` lo puede leer
cualquiera, y un itinerario dice exactamente qué días no hay nadie en casa.

Fuera del JSON:

- Dirección exacta del alojamiento y número de puerta.
- Referencias de reserva, localizadores, números de billete.
- Teléfonos y correos.

Eso va al panel **la portada del viaje → Datos privados** de la aplicación, que guarda en el
navegador y no sube a ninguna parte. En el JSON, el alojamiento lleva
coordenadas aproximadas del barrio y nada más.

Lo mismo con las fotos: por defecto viven en IndexedDB, solo en el dispositivo.
Publicar una es una decisión explícita — se copia el archivo a
`data/viajes/<id>/fotos/` y se referencia desde el lugar:

```json
"fotos": [{ "archivo": "data/viajes/leon-2026-08/fotos/catedral.jpg", "pie": "El rosetón oeste" }]
```
