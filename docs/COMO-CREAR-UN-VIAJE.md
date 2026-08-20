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

Cómo sacarlas bien:

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

## Qué NO se pone en el JSON

**El repositorio es público.** Todo lo que se escriba en `data/` lo puede leer
cualquiera, y un itinerario dice exactamente qué días no hay nadie en casa.

Fuera del JSON:

- Dirección exacta del alojamiento y número de puerta.
- Referencias de reserva, localizadores, números de billete.
- Teléfonos y correos.

Eso va al panel **Viaje → Datos privados** de la aplicación, que guarda en el
navegador y no sube a ninguna parte. En el JSON, el alojamiento lleva
coordenadas aproximadas del barrio y nada más.

Lo mismo con las fotos: por defecto viven en IndexedDB, solo en el dispositivo.
Publicar una es una decisión explícita — se copia el archivo a
`data/viajes/<id>/fotos/` y se referencia desde el lugar:

```json
"fotos": [{ "archivo": "data/viajes/leon-2026-08/fotos/catedral.jpg", "pie": "El rosetón oeste" }]
```
