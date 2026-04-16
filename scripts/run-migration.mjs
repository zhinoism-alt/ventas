/**
 * Runs the Supabase SQL migration via the REST API.
 * Usage:  SUPABASE_URL=https://xxx.supabase.co node scripts/run-migration.mjs
 *
 * Or set SUPABASE_URL in frontend/.env and it will be read from there.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

// Read .env
let url = process.env.SUPABASE_URL
let key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  try {
    const env = readFileSync(resolve(__dir, '../frontend/.env'), 'utf8')
    for (const line of env.split('\n')) {
      if (line.startsWith('SUPABASE_URL=') && !url)              url = line.split('=')[1].trim()
      if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=') && !key) key = line.split('=').slice(1).join('=').trim()
    }
  } catch { /* ignore */ }
}

if (!url || url.includes('REPLACE_WITH')) {
  console.error('❌  Set SUPABASE_URL in frontend/.env first.')
  process.exit(1)
}

const sql = readFileSync(resolve(__dir, '../supabase/migrations/20240415000000_initial.sql'), 'utf8')

console.log('🔗  Connecting to:', url)
console.log('📋  Running migration...')

const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`,
    'apikey': key,
  },
  body: JSON.stringify({ sql })
}).catch(() => null)

// exec_sql RPC doesn't exist by default — fall back to the SQL endpoint
const res2 = await fetch(`${url.replace('.supabase.co', '')}/pg/query`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
  body: JSON.stringify({ query: sql })
}).catch(() => null)

if (res?.ok || res2?.ok) {
  console.log('✅  Migration ran successfully!')
} else {
  console.log('')
  console.log('⚠️   The script could not run the migration automatically.')
  console.log('    Paste the SQL below into Supabase → SQL Editor → Run:')
  console.log('    File: supabase/migrations/20240415000000_initial.sql')
  console.log('')
  console.log('    (This is normal — Supabase restricts direct SQL execution via REST.)')
}
