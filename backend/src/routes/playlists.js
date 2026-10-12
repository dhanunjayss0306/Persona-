// routes/playlists.js — "tell me my favorite songs" → Spotify playlist.
//
// Spotify HAS an official API, so this is fully automatic. Steps:
//   1. GET /api/playlists/spotify/login  → redirect to Spotify's consent page
//   2. Spotify calls back /api/playlists/spotify/callback?code=... → we swap
//      the code for an access token (kept server-side, never in the browser)
//   3. POST /api/playlists {name, songs[]} → creates the playlist on his account
// JioSaavn has no playlist API — songs can only be opened via links (frontend).
const express = require('express');
const supabase = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
const tokens = new Map(); // userId -> {access_token, refresh_token}; use DB/Redis in production.

const CID = () => process.env.SPOTIFY_CLIENT_ID;
const CSEC = () => process.env.SPOTIFY_CLIENT_SECRET;
const REDIR = () => process.env.SPOTIFY_REDIRECT_URI;

router.get('/spotify/login', requireAuth, (req, res) => {
  if (!CID()) return res.status(500).json({ error: 'Spotify not configured (see .env)' });
  const scope = encodeURIComponent('playlist-modify-public playlist-modify-private');
  res.redirect('https://accounts.spotify.com/authorize?' +
    `client_id=${CID()}&response_type=code&redirect_uri=${encodeURIComponent(REDIR())}` +
    `&scope=${scope}&state=${req.user.id}`);
});

router.get('/spotify/callback', async (req, res) => {
  const { code, state } = req.query;
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${CID()}:${CSEC()}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIR() }),
  });
  const tok = await r.json();
  if (!tok.access_token) return res.status(400).send('Spotify login failed');
  tokens.set(state, tok);
  res.send('Spotify connected! You can close this tab and go back to Persona.');
});

async function spotify(userId, path, method = 'GET', body) {
  const t = tokens.get(userId);
  if (!t) throw new Error('Connect Spotify first (GET /api/playlists/spotify/login)');
  const r = await fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error('Spotify error: ' + r.status);
  return r.json();
}

// POST /api/playlists {name, songs: ["Song — Artist", ...]}
router.post('/', requireAuth, async (req, res) => {
  const { name, songs } = req.body || {};
  if (!name || !songs?.length) return res.status(400).json({ error: 'name and songs[] required' });
  try {
    const me = await spotify(req.user.id, '/me');
    const pl = await spotify(req.user.id, `/users/${me.id}/playlists`, 'POST', {
      name, description: 'Created by Persona', public: false,
    });
    // Find each song's Spotify ID, then add them.
    const uris = [];
    for (const s of songs.slice(0, 50)) {
      const found = await spotify(req.user.id, `/search?q=${encodeURIComponent(s)}&type=track&limit=1`);
      const track = found.tracks?.items?.[0];
      if (track) uris.push(track.uri);
    }
    if (uris.length) await spotify(req.user.id, `/playlists/${pl.id}/tracks`, 'POST', { uris });
    const { data } = await supabase.from('playlists').insert({
      user_id: req.user.id, name, service: 'spotify',
      service_playlist_id: pl.id, songs,
    }).select().single();
    res.status(201).json({ playlist: data, added: uris.length, of: songs.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', requireAuth, async (req, res) => {
  const { data } = await supabase.from('playlists').select('*')
    .eq('user_id', req.user.id).order('created_at', { ascending: false });
  res.json(data || []);
});

module.exports = router;
