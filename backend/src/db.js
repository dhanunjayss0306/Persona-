// db.js — one shared Supabase client for the whole backend.
// Supabase gives us Postgres (tables) + Storage (proof photo/voice files).
// We use the SERVICE_KEY here because this code runs on OUR server (trusted),
// never in the user's browser.
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.warn('[db] SUPABASE_URL / SUPABASE_SERVICE_KEY not set — set them in .env');
}

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_KEY || 'missing-key'
);

module.exports = supabase;
