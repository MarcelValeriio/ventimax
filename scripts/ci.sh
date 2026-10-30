#!/usr/bin/env bash
# Verificación completa: la misma que exige AGENTS.md. La usa GitHub Actions (.github/workflows/ci.yml)
# y se puede correr en local: ./scripts/ci.sh
# Solo suites con mocks (NODE_ENV=test). Nunca agregar aquí scripts de la lista "Scripts prohibidos".
set -uo pipefail
cd "$(dirname "$0")/.."

SUITES=(
  test-config-validators.ts
  test-config-store.ts
  test-whatsapp-edge-cases.js
  test-inbox-service.js
  simulate-ig-webhook.js
  simulate-messenger-webhook.js
  test-dynamic-menu.ts
  test-multicategoria.ts
  test-mensajes-marca.ts
  test-privacidad.ts
  test-horario.ts
  test-seguridad.ts
  test-flujo-no-laborable.ts
  test-envios.ts
  test-retiro.ts
  test-datos-negocio.ts
  test-imagenes-producto.ts
  test-cabeceras-seguridad.ts
  test-api-publica.ts
  test-registro-envios.ts
  test-pedido-web-bot.ts
  test-catalogo-web.ts
  test-catalogo-panel.ts
  test-descuentos.ts
  test-auditoria.ts
  test-cortesia-social.ts
  test-iconos.ts
  test-panel-referencias.ts
  test-entrega-web.ts
  test-preguntas-frecuentes.ts
  test-e2e-saas.js
  test-full-flow.js
  test-cash-logic.js
  test-mixed-payment.js
  test-sales-summary.js
  test-instagram-quick-replies.js
  test-web-push-fullstack.js
)

fallos=()

echo "▶ Build"
npm run build || fallos+=("build")

for s in "${SUITES[@]}"; do
  echo "▶ $s"
  if ! NODE_ENV=test npx tsx "scripts/$s"; then
    fallos+=("$s")
  fi
done

echo "▶ Imports del panel y catálogo (esbuild --bundle)"
while IFS= read -r archivo; do
  npx --yes esbuild@0.23.0 "$archivo" --bundle --external:'https://*' --outfile=/dev/null --log-level=error \
    || fallos+=("esbuild $archivo")
done < <(find public/src catalogo/js -name "*.js" -not -path "*/node_modules/*" | sort)

if [ ${#fallos[@]} -gt 0 ]; then
  echo ""
  echo "❌ Fallaron ${#fallos[@]}:"
  printf '   - %s\n' "${fallos[@]}"
  exit 1
fi
echo ""
echo "✅ Build, ${#SUITES[@]} suites e imports del panel en verde."
