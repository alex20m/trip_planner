#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"
ENV_BACKUP="$REPO_ROOT/.env.local.backup-$(date +%s)"
HAD_BACKUP=false

cleanup() {
  echo ""
  echo "→ Stopping Supabase..."
  supabase stop --no-backup 2>/dev/null || true

  if [[ "$HAD_BACKUP" == true ]]; then
    echo "→ Restoring .env.local"
    mv "$ENV_BACKUP" "$ENV_FILE"
  else
    rm -f "$ENV_FILE"
  fi

  echo "✓ Done"
}

# Register cleanup before touching any state
trap cleanup EXIT INT TERM

# ── Prereqs ────────────────────────────────────────────────────────────────────
if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ supabase CLI not found. Install it with:"
  echo "    brew install supabase/tap/supabase"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker is not running. Start Docker Desktop and try again."
  exit 1
fi

# ── Back up existing .env.local ────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  cp "$ENV_FILE" "$ENV_BACKUP"
  HAD_BACKUP=true
  echo "→ Backed up .env.local"
fi

# ── Start Supabase ─────────────────────────────────────────────────────────────
echo "→ Starting Supabase (first run downloads Docker images, ~2 min)..."
supabase start

# ── Write local .env.local ─────────────────────────────────────────────────────
STATUS=$(supabase status -o env)
SUPABASE_URL=$(echo "$STATUS" | grep '^API_URL=' | cut -d= -f2- | tr -d '"')
SUPABASE_ANON_KEY=$(echo "$STATUS" | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')
SUPABASE_SERVICE_ROLE_KEY=$(echo "$STATUS" | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')

cat > "$ENV_FILE" <<EOF
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
RESEND_FROM="PlanPal <onboarding@resend.dev>"
EOF

echo ""
echo "✓ App:    http://localhost:3000"
echo "✓ Studio: http://localhost:54323"
echo "✓ Mail:   http://localhost:54324 (sign-in code emails land here)"
echo ""
echo "  (sign in with any email — this is a local DB, separate from production)"
echo ""
echo "  Press Ctrl+C to stop and restore your .env.local"
echo ""

# ── Run dev server ─────────────────────────────────────────────────────────────
cd "$REPO_ROOT"
npx next dev
