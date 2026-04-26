# Triton Wars

[![Deploy](https://github.com/PezzaliAPP/triton-wars/actions/workflows/deploy.yml/badge.svg)](https://github.com/PezzaliAPP/triton-wars/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Battaglia navale 3D, **PWA gratuita**, su tre teatri di guerra:

- **Aria** — caccia, droni, dirigibili
- **Superficie** — portaerei, incrociatori, cacciatorpediniere
- **Profondità** — sommergibili, mine, sonar

Griglia volumetrica `10×10×6`, rendering WebGL2, multiplayer P2P online via WebRTC.

→ Demo live: <https://pezzaliapp.github.io/triton-wars/>

## Stato

**Fase 3 — Multiplayer P2P.** Singleplayer vs IA giocabile (Phase 2),
multiplayer 1v1 online via codice stanza condivisibile (Phase 3): trasporto
WebRTC con signaling Nostr pubblico (zero account, zero backend), commit-reveal
SHA-256 anti-cheat, riconnessione automatica entro 30s con risoluzione di
snapshot mismatch. Il singleplayer resta installabile come PWA e funziona
offline.

## Stack

| Area | Scelta | Costo |
|---|---|---|
| Bundler | [Vite](https://vitejs.dev/) | gratis |
| Linguaggio | TypeScript (strict) | gratis |
| 3D engine | [Three.js](https://threejs.org/) r170 | gratis |
| PWA | [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) (Workbox) | gratis |
| Multiplayer | [Trystero](https://github.com/dmotz/trystero) (WebRTC + Nostr signaling) | gratis |
| Hosting | GitHub Pages | gratis |
| CI/CD | GitHub Actions | gratis (tier pubblico) |

Nessuna API a pagamento, nessuna chiave segreta, nessun servizio con tier scaduti.
Ogni dipendenza esterna è documentata sotto e può essere sostituita.

## Sviluppo locale

Requisiti: **Node.js 20+** (vedi `.nvmrc`).

```bash
npm install
npm run dev       # apre http://localhost:5173
npm run build     # output in dist/
npm run preview   # serve dist/ in locale
```

Le icone PWA vengono generate automaticamente prima di `dev` e `build` da
`scripts/gen-icons.mjs` (nessuna dipendenza esterna, usa solo `zlib` di Node).

## Controlli

- **Desktop**: drag mouse per ruotare la scena, rotella per zoom.
- **Mobile**: drag per ruotare, pinch a due dita per zoom.

## Servizi esterni e come sostituirli

| Servizio | Uso | Sostituibile con |
|---|---|---|
| GitHub Pages | hosting statico | qualsiasi static host (Netlify, Cloudflare Pages, S3) |
| GitHub Actions | CI/CD | GitLab CI, Cloudflare Pages, deploy manuale |
| Nostr relays (default Trystero) | segnalazione WebRTC | strategia MQTT/IPFS/Firebase di Trystero |

## Multiplayer online

Il bottone **Gioca Online** apre la lobby:

- **Crea partita** genera un codice `TRITON-XXXX-XXXX` da condividere (con
  link `?room=...` deep-link).
- **Unisciti** apre l'input per chi riceve il codice.
- I due browser si connettono direttamente via WebRTC; la signaling viaggia
  su relay Nostr pubblici, il payload di gioco è end-to-end peer-to-peer.

**Bundle.** Trystero è caricato via `import()` dinamico, quindi il
first-paint del singleplayer non lo include: ~145 KB gzip in fase singola
contro ~163 KB se l'utente entra in lobby online.

**Anti-cheat.** Prima del primo tiro ogni client manda all'altro
`SHA-256(flotta + nonce)`; a fine partita rivela `(flotta, nonce)` e l'altro
verifica sia il commitment sia che ogni risposta `hit/miss/sunk` ricevuta sia
coerente con la flotta rivelata. Se una qualunque dichiarazione non quadra,
viene mostrato il banner "Partita non valida".

**Riconnessione.** Heartbeat ogni 5s; se un peer scompare la partita resta in
attesa fino a 30s. Al rientro i due client si scambiano uno snapshot dello
stato e — in caso di divergenza — quello con il timestamp più alto vince.

## Roadmap

- [x] Fase 1 — fondamenta: scena 3D, griglia, PWA shell, deploy
- [x] Fase 2 — gameplay singleplayer + IA base
- [x] Fase 3 — multiplayer P2P con codice stanza
- [ ] Fase 4 — rifinitura: tutorial, FFA, post-processing
- [ ] Fase 5 — lancio: README con GIF, link da `alessandropezzali.it`

## Licenza

[MIT](./LICENSE) © 2026 Alessandro Pezzali
