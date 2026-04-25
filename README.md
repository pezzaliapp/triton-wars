# Triton Wars

[![Deploy](https://github.com/PezzaliAPP/triton-wars/actions/workflows/deploy.yml/badge.svg)](https://github.com/PezzaliAPP/triton-wars/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Battaglia navale 3D, **PWA gratuita**, su tre teatri di guerra:

- **Aria** — caccia, droni, dirigibili
- **Superficie** — portaerei, incrociatori, cacciatorpediniere
- **Profondità** — sommergibili, mine, sonar

Griglia volumetrica `10×10×6`, rendering WebGL2, multiplayer P2P (in arrivo nelle fasi successive).

→ Demo live: <https://pezzaliapp.github.io/triton-wars/>

## Stato

**Fase 1 — Fondamenta.** In questo momento il progetto contiene la struttura,
la scena 3D con la griglia volumetrica navigabile, lo scaffolding PWA e il
deploy automatico su GitHub Pages. Il gameplay arriva nelle fasi successive
(vedi [`prompt-claude-code.md`](./prompt-claude-code.md)).

## Stack

| Area | Scelta | Costo |
|---|---|---|
| Bundler | [Vite](https://vitejs.dev/) | gratis |
| Linguaggio | TypeScript (strict) | gratis |
| 3D engine | [Three.js](https://threejs.org/) r170 | gratis |
| PWA | [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) (Workbox) | gratis |
| Multiplayer | [PeerJS](https://peerjs.com/) (broker pubblico) | gratis |
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
| PeerJS broker | segnalazione WebRTC (Fase 3) | Trystero (BitTorrent/Nostr/Firebase) |

## Roadmap

- [x] Fase 1 — fondamenta: scena 3D, griglia, PWA shell, deploy
- [ ] Fase 2 — gameplay singleplayer + IA base
- [ ] Fase 3 — multiplayer P2P con codice stanza
- [ ] Fase 4 — rifinitura: tutorial, FFA, post-processing
- [ ] Fase 5 — lancio: README con GIF, link da `alessandropezzali.it`

## Licenza

[MIT](./LICENSE) © 2026 Alessandro Pezzali
