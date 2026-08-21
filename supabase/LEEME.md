# Supabase como backend

Proyecto: **`kkzxwnmxksamclpphgmx`** · región y credenciales en el panel de Supabase.

Estado: **en marcha y en uso.** Esquema aplicado, cliente configurado, viaje
sembrado y el circuito cerrado en las dos direcciones.

## Cómo quedó, el 20 de agosto de 2026

**Esquema aplicado** con el conector MCP, desde este mismo archivo SQL. Las tres
tablas con RLS y 4 / 2 / 1 políticas. Comprobado **desde fuera**, que es lo que
cuenta: con la clave publicable y sin sesión, las tres devuelven `[]` y un
`POST` a `viajes` responde **HTTP 401** con `new row violates row-level
security policy`.

**URLs de autenticación** configuradas en el panel el **21 de agosto de 2026**
— y hasta ese día no, aunque este archivo lo diera por hecho desde el 20. El
proyecto seguía con la *Site URL* de fábrica, `http://localhost:3000`, así que
desde la web publicada el enlace del correo aterrizaba ahí. Ahora: *Site URL*
`https://yivanx.github.io/`, y en las *Redirect URLs*
`https://yivanx.github.io/**` y `http://localhost:8080/**`. Es lo único de todo
esto que no se puede hacer desde el conector.

**La entrada de `localhost:8080` no es un extra, es obligatoria** — y explica por
qué el fallo se escondió una jornada entera. GoTrue acepta sin preguntar
cualquier destino con el **mismo hostname que la Site URL**, así que mientras la
Site URL fue `localhost:3000` valía cualquier puerto de `localhost`: el enlace
funcionaba en local *con la configuración rota*, y solo fallaba desde
`yivanx.github.io`. En cuanto la Site URL deja de ser `localhost`, el servidor de
`herramientas/servir.mjs` se queda fuera si no está en la lista.

**Cómo se comprueba sin gastar correos.** El plan gratuito manda dos por hora, y
pedir un enlace real para ver a dónde apunta es caro. El endpoint de verificación
resuelve el destino con las mismas reglas que el enlace del correo y lo devuelve
en la cabecera `Location`, sin mandar nada:

```
curl -s -o /dev/null -D -   "https://kkzxwnmxksamclpphgmx.supabase.co/auth/v1/verify?token=x&type=magiclink&redirect_to=<destino>"   | grep -i "^location"
```

Si el `Location` devuelve el destino, está permitido. Si devuelve otra cosa, esa
otra cosa es la *Site URL* y el destino está **rechazado**. Sin `redirect_to`,
revela la *Site URL* directamente. Medido así el 21 de agosto de 2026:
`https://yivanx.github.io/` y `http://localhost:8080/` pasan;
`http://localhost:9999/` y un dominio inventado caen a la *Site URL*, que es lo
que demuestra que la lista está puesta de verdad y no colando por hostname.

**Viaje de León sembrado** desde el navegador y con la sesión de Yixuan, **no
desde el conector**: el conector escribe como `service_role` y salta RLS, así
que la fila habría entrado igual con las políticas mal y no habríamos demostrado
nada. Pasándolo por la sesión real se ejercitó el camino entero — `viajes_crear`,
el trigger `alta_propietario` y después `viajes_leer`.

**La bajada, probada borrando la copia local y recargando.** Que la parada se
viera en pantalla no demostraba nada: podía estar pintándose de `localStorage`.
Con la clave local borrada, el itinerario volvió de la nube.

## Cómo se usa ahora

- **Se guarda cuando tú lo dices.** Al cambiar el itinerario aparece una barra
  con cuántos cambios hay sin subir y un botón para subirlos todos de una vez.
  Nada sale solo hacia la nube.
- **Cada parada que has tocado enseña su estado**: nube con flecha si está sin
  subir, nube lisa si ya está. Las paradas del archivo no llevan icono porque no
  tienen ese ciclo de vida: están en el archivo.
- **Al cambiar de día o de pestaña se avisa** si te dejas cambios sin guardar,
  una vez por tanda.

## Lo que hay que saber para mantenerlo

- **El esquema se edita aquí y se aplica**, nunca al revés. Este `.sql` rehace el
  proyecto entero desde cero, incluidos los `revoke` y la política de lectura.
- **La política de lectura de `viajes` lleva `propietario = auth.uid()` por una
  razón concreta**, no por comodidad: el cliente inserta con `RETURNING`, y con
  RLS eso obliga a que la fila recién creada pase la política de `SELECT` — antes
  de que dispare el trigger `AFTER INSERT` que da de alta al miembro. Sin esa
  condición, crear un viaje devuelve 403 con un mensaje que señala a la escritura
  y engaña.
- **La clave `service_role` no se pone en ningún archivo del repositorio.** La
  publicable sí, y está bien: lo que protege los datos es RLS.

---

## Cómo entra el primero, y cómo entra el segundo

1. Abre la web → **el icono de perfil** → escribe tu correo → **Mandarme el enlace**.
2. Abre el enlace **en el mismo dispositivo**. La sesión se queda y se renueva
   sola; no hay que volver a pedirlo.
3. Para invitar a alguien: que entre él con su correo, copie **su id** de esa
   misma pantalla, y te lo pase. Con ese id se le da acceso al viaje.

Se invita por id y no por correo a propósito: `auth.users` no es consultable
desde el cliente, y está bien que no lo sea — si lo fuera, cualquiera con la
clave publicable podría listar los correos de todos los usuarios.

---

## Lo que sube y lo que no

| Qué | Dónde vive |
|---|---|
| El viaje entero (`datos` jsonb) | **Supabase**, compartido entre los miembros |
| Paradas añadidas y quitadas | **Supabase**, dentro del documento del viaje |
| Visitado, notas, tareas, «qué mirar» | **Supabase**, por usuario y sin compartir |
| **Datos privados** (dirección, reservas) | **Solo el navegador.** No suben nunca |
| **Fotos** | **Solo el navegador** (IndexedDB). Pesan y no compensa |

Las notas de uno no las ve el otro: la política de `estado_personal` filtra por
`usuario_id`, así que ni siquiera el propietario del viaje las lee.

---

## La regla que no se rompe

**La nube es la fuente; el repositorio es el suelo.**

Sin `data/nube.json`, sin sesión, o con Supabase caído, la aplicación funciona
exactamente como antes: lee el viaje de `data/viajes/<id>.json` y guarda en el
navegador. No hay pantalla de error ni funcionalidad perdida.

Esto no es prudencia teórica. **El proyecto anterior de esta cuenta se evaporó y
se llevó por delante una vista y tres funciones SQL que solo existían dentro de
él.** El dato se salvó porque su fuente de verdad estaba en archivos locales. De
ahí las dos reglas de esta carpeta:

- **El esquema se edita aquí y se aplica**, nunca al revés. Este archivo SQL es
  la fuente de verdad, y con él se rehace el proyecto entero desde cero.
- **El JSON del repositorio se mantiene al día** como semilla y respaldo. Cuando
  el viaje cambie mucho en la nube, se vuelca con
  `portada del viaje → Copiar como JSON` y se pega en el archivo.

---

## Los planes gratuitos se pausan

Supabase pausa los proyectos gratuitos tras una semana sin actividad. Un proyecto
pausado tarda un rato en despertar la primera vez que se le habla.

Para un viaje de seis días eso importa: **abre la web una vez el día antes de
salir** para que el proyecto esté despierto. Y si el día del viaje no responde,
no pasa nada — la aplicación sigue leyendo del repositorio y del navegador.
