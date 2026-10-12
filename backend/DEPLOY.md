# Deploy — where the backend lives (your decision)

**The one rule:** this server must stay awake 24×7. The nag loop runs inside
it (`src/services/scheduler.js` ticks every minute). If the server sleeps, no
nags fire until something wakes it up. So "free but sleeps" hosts break the
core feature.

## Options (checked 2026-10-12)

| Option | Cost | Stays awake? | Effort | The catch |
|---|---|---|---|---|
| **Oracle Cloud Always Free** (recommended) | ₹0 forever | Yes | Medium — you set up a Linux box once | Signup needs a card (₹0, $1 hold, not charged); ARM machines are often "out of capacity" in India — retry or start with 1 OCPU |
| Railway Hobby | ~₹440/mo ($5) | Yes | Low — connect repo, paste env vars | Paid from day one, needs a card |
| Render Starter | ~₹585/mo ($7) | Yes | Low | Priciest simple option |
| Fly.io (smallest) | ~₹170/mo ($1.94) | Yes | Medium | **No free tier for new accounts anymore** — only a 7-day trial now, then paid; card needed |
| Hetzner VPS | ~₹375/mo (€4.15) | Yes | Medium — like Oracle, your own box | Same learning curve as Oracle, but costs money |

**What does NOT work for this app:** Render/Railway/Vercel *free* tiers —
they sleep after ~15 min idle, so the first nag of the day would arrive late
(or never, if nothing wakes the server). Free is fine for the database
(Supabase free tier) and for the phone app itself — only the server brain
needs a permanent home.

## Recommended: Oracle Cloud Always Free (₹0)

You get a real Linux server (2 CPU / 12 GB RAM — overkill for this app, free
forever). Steps:

1. **Sign up** at oracle.com/cloud/free — email + phone + card ($1 temporary
   hold, reversed; you are NOT charged). **Pick your home region carefully**
   (e.g. `ap-hyderabad-1`) — it can never be changed later.
2. **Create the VM:** Compute → Instances → Create instance.
   - Image: Ubuntu 24.04 (aarch64)
   - Shape: Ampere → `VM.Standard.A1.Flex` → 2 OCPU / 12 GB
     (if "out of host capacity": try 1 OCPU / 6 GB, another availability
     domain, or a quiet hour — this is normal on the free tier)
   - Networking: public subnet + assign a public IPv4
   - Add your SSH key (generate one on your laptop if needed)
3. **Open the firewall:** Networking → your VCN → Security Lists → add ingress
   rules TCP **22** and TCP **3001** from `0.0.0.0/0`.
   (Port 3001 = this backend. Never expose anything else.)
4. **On the server, run:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install -y nodejs git
   git clone <your repo URL> persona && cd persona/persona-backend
   npm install
   cp .env.example .env   # fill in your keys (same values as local)
   sudo npm install -g pm2
   pm2 start src/index.js --name persona
   pm2 startup && pm2 save   # restarts the app if the server reboots
   ```
5. **Check it:** `http://<your-server-ip>:3001/health` should show
   `{"ok":true,"app":"persona-backend",...}`.
6. **Watchdog (free):** add that `/health` URL to UptimeRobot's free plan —
   it pings every 5 min and emails you if the server ever goes down. The
   scheduler's own every-minute tick also keeps the box "active", which helps
   with Oracle's idle-instance policy.

## Fallback: Railway (~₹440/mo, simplest)

1. Push this folder to a GitHub repo (private is fine).
2. railway.app → New Project → Deploy from repo.
3. Variables tab: paste every line from your local `.env`.
4. It deploys on every push, stays warm, done. The `/health` endpoint is your
   uptime check.

## Your call

- **₹0 + one-time setup:** Oracle (guide above).
- **Zero setup, small monthly cost:** Railway.
- Tell me which one and I'll write the exact remaining steps (SSH keys, env
  values, first deploy) matched to your pick.
