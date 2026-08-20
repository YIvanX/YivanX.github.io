# Supabase como backend

Proyecto: **`kkzxwnmxksamclpphgmx`** · región y credenciales en el panel de Supabase.

Estado: **esquema aplicado y cliente configurado. Falta la configuración de
URLs de autenticación, que es del panel, y sembrar el viaje.**

## Hecho el 20 de agosto de 2026

**Esquema aplicado** con el conector MCP, desde este mismo archivo SQL. Comprobado
con la consulta del final del archivo: `viajes` 4 políticas, `viaje_miembros` 2,
`estado_personal` 1, y `rls = true` en las tres.

**Y comprobado desde fuera, que es lo que cuenta:** con la clave publicable y sin
sesión, las tres tablas devuelven `[]` y un `POST` a `viajes` se rechaza con
**HTTP 401** y `new row violates row-level security policy`. RLS cierra la puerta
de verdad, no solo en el catálogo.

**`data/nube.json` escrito** con la URL y la clave publicable. Medido en el
navegador: la nube sale como configurada, el panel **Viaje → Nube** pinta el
formulario de acceso, cero errores de consola y cero peticiones fallidas.

**Esa clave es pública y está bien que lo sea.** Va dentro del JavaScript de un
sitio público: cualquiera puede leerla. Lo que protege los datos es RLS, no la
clave. Por eso el esquema no es opcional.

**La clave `service_role` NO se pone aquí ni en ningún archivo del repositorio.**
Esa sí salta RLS y da acceso total.

## Lo que queda, en orden

**1. Configurar las URLs de autenticación** — panel de Supabase, **Authentication
→ URL Configuration**. Esto no se puede hacer desde el conector:

- *Site URL*: `https://yivanx.github.io/`
- *Redirect URLs*: añadir `http://localhost:8080/` para poder probar en local

Un proyecto nuevo viene con `http://localhost:3000`, así que sin este paso el
enlace del correo aterriza donde no hay nada.

**2. Entrar una vez** desde la web → **Viaje → Nube** → correo → *Mandarme el
enlace*, y abrirlo en el mismo dispositivo. Hasta que no exista el usuario no se
puede sembrar nada: la fila de `viajes` necesita un propietario real de
`auth.users`.

**3. Sembrar el viaje de León** subiendo `data/viajes/leon-2026-08.json` como
primera fila de `viajes`, y comprobar el circuito entero en el navegador.

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
