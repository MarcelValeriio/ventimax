#!/usr/bin/env bash
# Arranca el servidor contra el MongoDB local de Docker (docker-compose.local.yml).
#
# Seguridad: todas las credenciales externas se definen VACÍAS aquí. dotenv no sobrescribe variables
# ya definidas, así que aunque el .env tuviera datos reales, este modo no puede enviar WhatsApp,
# llamar a Meta, a la IA ni a Cloudinary, ni conectarse a otra base.
set -euo pipefail

cd "$(dirname "$0")/.."

export MONGODB_URI="${LOCAL_MONGODB_URI:-mongodb://127.0.0.1:27017/ventimax_local}"
case "$MONGODB_URI" in
  mongodb://127.0.0.1:*|mongodb://localhost:*) ;;
  *) echo "❌ dev-local solo acepta una base en 127.0.0.1 o localhost (recibido otro host)." >&2; exit 1 ;;
esac

if ! (exec 3<>/dev/tcp/127.0.0.1/27017) 2>/dev/null; then
  echo "❌ MongoDB local no responde en 127.0.0.1:27017." >&2
  echo "   Levántalo con: docker compose -f docker-compose.local.yml up -d" >&2
  exit 1
fi

export NODE_ENV=development
export BRAND_NAME="${BRAND_NAME:-ventimax}"
export PORT="${PORT:-3000}"
export FORCE_CLEAN_SEED=false

# Secretos locales generados en cada arranque (las sesiones caducan al reiniciar).
export JWT_SECRET="local-$(openssl rand -hex 32)"
export SESSION_SECRET="local-$(openssl rand -hex 32)"

# Credenciales externas: vacías a propósito.
for v in \
  WHATSAPP_TOKEN VERIFY_TOKEN WHATSAPP_PHONE_NUMBER_ID PHONE_NUMBER_ID WHATSAPP_BUSINESS_ACCOUNT_ID \
  WHATSAPP_APP_SECRET WHATSAPP_TEMPLATE_ORDER WHATSAPP_TEMPLATE_REACTIVACION WHATSAPP_PHONE \
  ADMIN_PHONE_NUMBER ADMIN_PHONE_NUMBER_2 DELIVERY_PHONE_NUMBER \
  IG_VERIFY_TOKEN IG_ACCOUNT_ID IG_ACCESS_TOKEN IG_APP_SECRET \
  FB_VERIFY_TOKEN FB_PAGE_ID FB_PAGE_ACCESS_TOKEN FB_APP_SECRET APP_SECRET APP_ID META_APP_ID \
  META_PIXEL_ID META_CAPI_TOKEN META_DATASET_ID META_CAPI_TEST_EVENT_CODE \
  DEEPSEEK_API_KEY OPENAI_API_KEY GEMINI_API_KEY GLADIA_API_KEY DEEPGRAM_API_KEY \
  CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET \
  VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_EMAIL; do
  export "$v="
done

# Primer administrador (F0-8): solo se usan si se pasan en la línea de comandos, nunca desde el .env.
export ADMIN_USER="${ADMIN_USER:-}"
export ADMIN_PASS="${ADMIN_PASS:-}"

echo "🧪 Modo local: marca '$BRAND_NAME', base local, sin credenciales externas."
echo "   Panel: http://localhost:$PORT/panel"
exec npx tsx index.ts
