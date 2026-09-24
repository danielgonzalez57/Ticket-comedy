# Ticket Comedy

Venta de boletos para shows de stand-up comedy en Venezuela. Flujo de pago
**manual** (Pago Móvil / Zelle / transferencia): el cliente reserva su asiento y
el admin confirma el pago a mano.

**Stack:** Next.js 15 (App Router) · TypeScript · Supabase (Postgres + Auth +
Storage) · Tailwind v4 · shadcn/ui · Resend · qrcode.

## Puesta en marcha

### 1. Dependencias

```bash
npm install
```

### 2. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pega y ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql).
   Esto crea las tablas, los índices, las políticas RLS, la función
   `create_pending_order` y el bucket público `posters`.
3. Crea el usuario admin en **Authentication → Users → Add user** (email +
   contraseña). No hay registro público; ese usuario es el único admin.
4. Copia las llaves desde **Project Settings → API**.

### 3. Variables de entorno

Copia `.env.example` a `.env.local` y complétalo:

```bash
cp .env.example .env.local
```

| Variable | Descripción |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Llave anónima (pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave service role (¡secreta!) |
| `RESEND_API_KEY` | API key de Resend (correos). Opcional en dev |
| `RESEND_FROM` | Remitente verificado en Resend |
| `NEXT_PUBLIC_SITE_URL` | URL pública del sitio (para QR/links) |
| `NEXT_PUBLIC_WHATSAPP_ADMIN` | WhatsApp del admin, formato `58412…` |
| `NEXT_PUBLIC_PAYMENT_INFO` | Datos de Pago Móvil mostrados al cliente |
| `NEXT_PUBLIC_BINANCE_INFO` | Opcional: reemplaza los datos de Binance por defecto (`lib/constants.ts`), mismo formato `Etiqueta: valor \| Etiqueta: valor` |

### 4. Correr en local

```bash
npm run dev
```

- Público: <http://localhost:3000>
- Admin: <http://localhost:3000/admin> (redirige a `/admin/login`)

## Cómo funciona

- **Crear show** (`/admin/shows/new`): defines filas × columnas y se generan los
  asientos (A1, A2…) automáticamente. Publícalo para que aparezca al público.
- **Reservar** (`/shows/[id]`): el cliente elige hasta **4 asientos**, llena sus
  datos y ve a dónde transferir. La orden queda `pending` y los asientos quedan
  en `held` por **20 minutos** (se liberan solos al expirar).
- **Confirmar pago** (`/admin/orders/[id]`): el admin marca la orden como pagada
  → los asientos pasan a `sold`, se envía el correo con el QR inline y se genera
  un link de WhatsApp prearmado para avisar al cliente.
- **Validar en puerta** (`/admin/validate`): escanea el QR con la cámara del
  celular. Verde = válida, ámbar = ya usada, rojo = inválida/cancelada.

La lógica sensible (crear órdenes, confirmar pagos, validar, leer órdenes) corre
en el servidor con la **service role key**; el cliente anónimo solo puede leer
shows publicados.

## Deploy en Vercel

1. Importa el repo en Vercel.
2. Carga las mismas variables de entorno (marca `SUPABASE_SERVICE_ROLE_KEY` y
   `RESEND_API_KEY` como secretas) y ajusta `NEXT_PUBLIC_SITE_URL` al dominio.
3. Deploy.
