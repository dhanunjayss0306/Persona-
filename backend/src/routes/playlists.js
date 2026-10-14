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
const jwt = require('jsonwebtoken');
const stateSecret = () => process.env.JWT_SECRET;

const CID = () => process.env.SPOTIFY_CLIENT_ID;
const CSEC = () => process.env.SPOTIFY_CLIENT_SECRET;
const REDIR = () => process.env.SPOTIFY_REDIRECT_URI;

router.get('/spotify/login', requireAuth, (req, res) => {
  if (!CID()) return res.status(500).json({ error: 'Spotify not configured (see .env)' });
  const scope = encodeURIComponent('playlist-modify-public playlist-modify-private user-read-currently-playing');
  const state = jwt.sign({ sub:req.user.id, purpose:'spotify' }, stateSecret(), { expiresIn:'10m' });
  res.redirect('https://accounts.spotify.com/authorize?' +
    `client_id=${CID()}&response_type=code&redirect_uri=${encodeURIComponent(REDIR())}` +
    `&scope=${scope}&state=${encodeURIComponent(state)}`);
});
router.post('/spotify/login-url', requireAuth, (req,res)=>{if(!CID()||!REDIR())return res.status(503).json({error:'Spotify is not configured.'});const state=jwt.sign({sub:req.user.id,purpose:'spotify'},stateSecret(),{expiresIn:'10m'});const scope=encodeURIComponent('playlist-modify-public playlist-modify-private playlist-read-private user-read-currently-playing');res.json({url:`https://accounts.spotify.com/authorize?client_id=${CID()}&response_type=code&redirect_uri=${encodeURIComponent(REDIR())}&scope=${scope}&state=${encodeURIComponent(state)}`});});

router.get('/spotify/callback', async (req, res) => {
  try {
  const { code } = req.query; let identity;
  try { identity = jwt.verify(String(req.query.state||''), stateSecret()); } catch { return res.status(400).send('Spotify connection expired or invalid.'); }
  if (identity.purpose !== 'spotify' || !identity.sub) return res.status(400).send('Invalid Spotify connection.');
  if (typeof code !== 'string' || !code) return res.status(400).send('Spotify did not return an authorization code.');
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
  const crypto = require('crypto'), key = Buffer.from(process.env.OAUTH_ENCRYPTION_KEY || '', 'hex');
  if (key.length !== 32) return res.status(503).send('OAuth token encryption is not configured.');
  tok.expires_at=Date.now()+Number(tok.expires_in||3600)*1000;
  await storeSpotify(identity.sub,tok);
  res.send('Spotify connected! You can close this tab and go back to Persona.');
  } catch(error) { console.error('[spotify] callback failed:',error.message); if(!res.headersSent)res.status(502).send('Spotify connection failed. Return to Persona and try again.'); }
});

async function spotify(userId, path, method = 'GET', body) {
  const {data:row}=await supabase.from('oauth_tokens').select('encrypted_tokens').eq('user_id',userId).eq('provider','spotify').maybeSingle();
  const crypto=require('crypto'),key=Buffer.from(process.env.OAUTH_ENCRYPTION_KEY||'','hex');
  if(!row||key.length!==32) throw new Error('Connect Spotify first (or configure OAuth token encryption).');
  const [ivHex,blobHex]=row.encrypted_tokens.split(':'),blob=Buffer.from(blobHex,'hex'),decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(ivHex,'hex'));decipher.setAuthTag(blob.subarray(-16));
  let t=JSON.parse(Buffer.concat([decipher.update(blob.subarray(0,-16)),decipher.final()]).toString());
  if(t.expires_at<Date.now()+30000&&t.refresh_token){const refreshed=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:'Basic '+Buffer.from(`${CID()}:${CSEC()}`).toString('base64')},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:t.refresh_token})});const next=await refreshed.json();if(!refreshed.ok||!next.access_token)throw new Error('Spotify session expired. Connect Spotify again.');t={...t,...next,refresh_token:next.refresh_token||t.refresh_token,expires_at:Date.now()+Number(next.expires_in||3600)*1000};await storeSpotify(userId,t);}
  if (!t) throw new Error('Connect Spotify first (GET /api/playlists/spotify/login)');
  const r = await fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return {};
  if (!r.ok) throw new Error('Spotify error: ' + r.status);
  return r.json();
}
async function storeSpotify(userId,tok){const crypto=require('crypto'),key=Buffer.from(process.env.OAUTH_ENCRYPTION_KEY||'','hex');if(key.length!==32)throw new Error('OAUTH_ENCRYPTION_KEY must be 64 hex characters');const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(JSON.stringify(tok)),cipher.final(),cipher.getAuthTag()]);const {error}=await supabase.from('oauth_tokens').upsert({user_id:userId,provider:'spotify',encrypted_tokens:`${iv.toString('hex')}:${encrypted.toString('hex')}`},{onConflict:'user_id,provider'});if(error)throw error;}

router.post('/command-add', requireAuth, async (req,res) => {
  const {song,playlist,currently_playing}=req.body||{};
  if((!currently_playing&&(typeof song!=='string'||!song.trim()))||typeof playlist!=='string'||!playlist.trim())return res.status(400).json({error:'Song and playlist are required.'});
  try { const me=await spotify(req.user.id,'/me'); let track;
    if(currently_playing){const playback=await spotify(req.user.id,'/me/player/currently-playing');track=playback.item;if(!track)return res.status(409).json({error:'Nothing is playing in Spotify. Which song should I add?'});}
    else {const found=await spotify(req.user.id,`/search?q=${encodeURIComponent(song)}&type=track&limit=1`);track=found.tracks?.items?.[0];}
    if(!track)return res.status(404).json({error:'Spotify could not find that song.'});
    const lists=await spotify(req.user.id,'/me/playlists?limit=50');let target=(lists.items||[]).find(p=>p.name.toLocaleLowerCase()===playlist.trim().toLocaleLowerCase());
    if(!target)target=await spotify(req.user.id,`/users/${me.id}/playlists`,'POST',{name:playlist.trim(),description:'Created by Persona',public:false});
    await spotify(req.user.id,`/playlists/${target.id}/tracks`,'POST',{uris:[track.uri]});res.json({song:track.name,playlist:target.name,created:!(lists.items||[]).some(p=>p.id===target.id),url:target.external_urls?.spotify||null});
  }catch(error){res.status(502).json({error:error.message});}
});

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
  const { data, error } = await supabase.from('playlists').select('*')
    .eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

module.exports = router;
