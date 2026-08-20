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

**URLs de autenticación** configuradas en el panel — *Site URL*
`https://yivanx.github.io/` y `http://localhost:8080/` en las *Redirect URLs*.
Es lo único de todo esto que no se puede hacer desde el conector. Un proyecto
nuevo viene con `http://localhost:3000`, así que sin ese paso el enlace del
correo aterriza donde no hay nada.

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

1. Abre la web → **Viaje → Nube** → escribe tu correo → **Mandarme el enlace**.
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
  `Viaje → Copiar como JSON` y se pega en el archivo.

---

## Los planes gratuitos se pausan

Supabase pausa los proyectos gratuitos tras una semana sin actividad. Un proyecto
pausado tarda un rato en despertar la primera vez que se le habla.

Para un viaje de seis días eso importa: **abre la web una vez el día antes de
salir** para que el proyecto esté despierto. Y si el día del viaje no responde,
no pasa nada — la aplicación sigue leyendo del repositorio y del navegador.
