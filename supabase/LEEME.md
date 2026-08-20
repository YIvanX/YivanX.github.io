# Supabase como backend

Estado: **el esquema y el cliente están escritos y probados; falta el proyecto.**

El conector MCP apunta a `znvvakpgesptwglxjdtn`, que ya no existe — su dominio
devuelve NXDOMAIN. Hay que crear un proyecto nuevo. Son cuatro pasos.

---

## 1. Crear el proyecto

En [supabase.com](https://supabase.com) → **New project**. Región **West EU
(Ireland)** o **EU Central**, que es lo más cerca. Apunta la contraseña de la
base de datos: no se vuelve a enseñar.

## 2. Aplicar el esquema

Copia entero `supabase/migraciones/0001_esquema.sql` y pégalo en
**SQL Editor → New query → Run**.

Al final del archivo hay una consulta comentada que comprueba que ha quedado
bien. Descoméntala y ejecútala: **cada tabla tiene que salir con `rls = true` y
al menos una política.** Una tabla con RLS activado y cero políticas está cerrada
a cal y canto; una tabla sin RLS está abierta de par en par. La segunda es la que
no puede pasar.

## 3. Configurar el cliente

**Project Settings → API**, y copia la **URL** y la **clave publicable**
(`sb_publishable_…`, o la `anon` si tu proyecto es antiguo). Después:

```bash
cd D:\Claude\viajes
cat > data/nube.json <<EOF
{ "url": "https://TU-REF.supabase.co", "clavePublicable": "sb_publishable_..." }
EOF
```

**Esa clave es pública y está bien que lo sea.** Va dentro del JavaScript de un
sitio público: cualquiera puede leerla. Lo que protege los datos es RLS, no la
clave. Por eso el paso 2 no es opcional.

**La clave `service_role` NO se pone aquí ni en ningún archivo del repositorio.**
Esa sí salta RLS y da acceso total.

## 4. Reapuntar el conector MCP

En `D:\Claude\.mcp.json`, cambia `project_ref` por el del proyecto nuevo. **La
configuración MCP se lee al arrancar**, así que hay que reiniciar Claude Code
para que surta efecto.

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
