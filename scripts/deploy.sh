#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VentasPro — Full deploy script
# Run this from your own terminal (not Claude Code) since it needs internet.
#
# Usage:
#   bash scripts/deploy.sh
#
# Required env vars (can be set in frontend/.env):
#   VERCEL_TOKEN              — Vercel personal access token
#   VITE_SUPABASE_URL         — https://xxxxx.supabase.co
#   VITE_SUPABASE_ANON_KEY    — sb_publishable_...
#   SUPABASE_SERVICE_ROLE_KEY — sb_secret_...
#   VITE_CLERK_PUBLISHABLE_KEY
#   CLERK_SECRET_KEY
#   CRON_SECRET
# ─────────────────────────────────────────────────────────────────────────────
set -e

# ── Read vars from frontend/.env ─────────────────────────────────────────────
if [ -f frontend/.env ]; then
  set -a
  # shellcheck disable=SC1091
  source frontend/.env
  set +a
fi

# ── Validate required vars ────────────────────────────────────────────────────
if [ -z "$VERCEL_TOKEN" ]; then
  echo "❌  Set VERCEL_TOKEN in frontend/.env first, then re-run."
  exit 1
fi

if [ -z "$VITE_SUPABASE_URL" ] || [ "$VITE_SUPABASE_URL" = "REPLACE_WITH_YOUR_SUPABASE_URL" ]; then
  echo "❌  Set VITE_SUPABASE_URL in frontend/.env first, then re-run."
  exit 1
fi

echo "✅  Supabase URL: $VITE_SUPABASE_URL"

# ── Step 1: install frontend deps ────────────────────────────────────────────
echo ""
echo "📦  Installing dependencies..."
(cd frontend && npm install --legacy-peer-deps)

# ── Step 2: deploy to Vercel ─────────────────────────────────────────────────
echo ""
echo "🚀  Deploying to Vercel..."

cd frontend

vercel deploy --prod --yes \
  --token "$VERCEL_TOKEN" \
  -e VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  -e VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  -e SUPABASE_URL="$VITE_SUPABASE_URL" \
  -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  -e VITE_CLERK_PUBLISHABLE_KEY="$VITE_CLERK_PUBLISHABLE_KEY" \
  -e CLERK_SECRET_KEY="$CLERK_SECRET_KEY" \
  -e CRON_SECRET="$CRON_SECRET"

cd ..

echo ""
echo "✅  Deploy complete!"
echo "    Copy the URL above and add it as a CNAME in Cloudflare for zhinoism.online"
