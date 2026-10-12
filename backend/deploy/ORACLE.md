# Deploying the Persona backend on Oracle Cloud (Always Free)

## 1. Sign up — oracle.com/cloud/free
- Needs: email + phone + a credit/debit card (verification hold only — not charged; no prepaid/virtual cards).
- **Home region is PERMANENT** — pick ap-mumbai-1 or ap-hyderabad-1 (closest to you).

## 2. Create the VM — Compute → Instances → Create
- Image: **Ubuntu 24.04** (ARM build).
- Shape: **VM.Standard.A1.Flex → 2 OCPU / 12 GB RAM** (the Always Free max since June 2026).
- Networking: public subnet + auto-assign public IPv4. Paste your SSH public key.
- If it says **"Out of host capacity"**: retry later or try the other region — this is the normal free-tier experience. (Upgrading the account to Pay-As-You-Go keeps everything $0 inside free limits and usually fixes capacity.)

## 3. Open the port
- The VM's **security list**: add ingress TCP **3001** from 0.0.0.0/0 (or 80/443 if you add nginx later).
- On the VM itself: `sudo iptables -I INPUT -p tcp --dport 3001 -j ACCEPT` (Ubuntu blocks it by default too).

## 4. Install the backend
```bash
# from YOUR machine, copy the code up:
scp -r ~/workspace/persona-backend ubuntu/<VM-PUBLIC-IP>:~/
# SSH in:
ssh ubuntu/<VM-PUBLIC-IP>
bash ~/persona-backend/deploy/oracle-setup.sh
```
The script installs Node 24, deps, and registers a systemd service (auto-restart, starts on boot).

## 5. Fill `.env` on the VM, then
```bash
sudo systemctl restart persona
curl http://localhost:3001/health   # should answer {"ok":true,...}
```

## Honest catches (verified Sept 2026)
- **Idle reclaim:** Oracle may reclaim the VM if CPU, network AND memory all sit under 20% for 7 days. A quiet personal backend can look idle — small but real risk. Keep the project non-trivial or accept it.
- **Capacity lottery** (see step 2).
- **Log in to the console at least monthly** — 30-day-idle accounts can be flagged.
- 2 OCPU / 12 GB is *plenty* for this backend (it needs ~0.1 CPU / 200 MB).
