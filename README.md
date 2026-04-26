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

**Fase 3.1 — Hotfix online.** Singleplayer vs IA giocabile (Phase 2),
multiplayer 1v1 online via codice stanza condivisibile (Phase 3): trasporto
WebRTC con signaling Nostr pubblico (zero account, zero backend), commit-reveal
SHA-256 anti-cheat, riconnessione automatica entro 30s con risoluzione di
snapshot mismatch. Il singleplayer resta installabile come PWA e funziona
offline.

Phase 3.1 ha aggiunto:

- **Flusso di invito esplicito** — chi apre `?room=…` vede prima un dialog
  "Sei stato invitato!"; l'host conferma esplicitamente l'avvio con
  "Pronto a iniziare?" prima che la stanza si chiuda.
- **Hard-cap a 2 peer** con messaggio `roomFull` mirato per il terzo
  giocatore (`stage: 'pending' | 'locked'`).
- **Triple-guard sulla "vittoria fantasma"**: un peer che droppa o forfeita
  prima del primo colpo non genera più un `Hai vinto`; la sessione torna al
  menu via banner dedicato.
- **Banner di riconnessione** in alto al centro con counter `1/3 → 2/3 → 3/3`
  e flash verde "Riconnesso!" al rientro.
- **Guardia WebView in-app iOS**: detection UA + handler
  `webglcontextlost/restored` + banner sticky "Apri in Safari" (dismissable
  per 7 giorni).
- **Share + QR** sulla schermata di creazione stanza
  (`navigator.share` con fallback copia, `qrcode-svg` lazy-imported).

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

- **Invita un amico** genera un codice `TRITON-XXXX-XXXX` con link
  `?room=...`; la schermata host mostra il timer di attesa, "Condividi"
  (`navigator.share` con fallback copia link) e un QR collassabile
  (`qrcode-svg` caricato on-demand).
- **Ho ricevuto un codice** apre l'input per chi non arriva via deep link.
- Chi apre il link `?room=...` vede subito un dialog **"Sei stato invitato!"**
  con Unisciti / Annulla. Annulla pulisce `?room=` dall'URL così un refresh
  non ri-apre il dialog.
- Quando il guest si collega, l'host vede **"Pronto a iniziare?"** con
  bottoni `Inizia partita` / `Aspetta`. La stanza si chiude solo dopo
  `Inizia` — un terzo giocatore che entra prima riceve "Stanza occupata",
  dopo "Stanza piena".
- Aspetta mette il guest in stand-by per 60s con countdown visibile;
  scaduti i 60s il guest vede "L'host non ha avviato la partita".
- Se l'host non conferma entro 30s, il guest vede
  "L'host non ha confermato l'invito" e torna al menu.

**State machine lobby**: `awaiting-guest → guest-pending → match-starting →
placing → playing → ended`.

I due browser si connettono direttamente via WebRTC; la signaling viaggia
su relay Nostr pubblici, il payload di gioco è end-to-end peer-to-peer.

**Bundle.** Trystero e `qrcode-svg` sono caricati via `import()` dinamico,
quindi il first-paint del singleplayer non li include. Stato Phase 3.1
(`npm run build`):

| Chunk | Raw | Gzip | Quando |
|---|---|---|---|
| main `index-*.js` | 572 KB | **147 KB** | sempre |
| trystero (lazy) | 48 KB | **18.5 KB** | entrando in lobby online |
| `qrcode-svg` (lazy) | 19 KB | **6.8 KB** | aprendo "Mostra QR" |
| workbox | 5.7 KB | **2.4 KB** | sempre (PWA shell) |
| CSS | 21 KB | **4.7 KB** | sempre |

Online totale (escluso QR opzionale): **~172 KB gzip**, sotto il target di 175 KB.

**Anti-cheat.** Prima del primo tiro ogni client manda all'altro
`SHA-256(flotta + nonce)`; a fine partita rivela `(flotta, nonce)` e l'altro
verifica sia il commitment sia che ogni risposta `hit/miss/sunk` ricevuta sia
coerente con la flotta rivelata. Se una qualunque dichiarazione non quadra,
viene mostrato il banner "Partita non valida".

**Riconnessione.** Heartbeat ogni 5s con counter visibile in un banner
top-center (`1/3 → 2/3 → 3/3`); recupero del pong chiude il banner con un
flash "Riconnesso!". Se il peer scompare la partita resta in attesa fino a
30s; al rientro i due client si scambiano uno snapshot e — in caso di
divergenza — quello con il timestamp più alto vince.

**Hard-cap 2 peer.** Una stanza Trystero accetta in teoria N peer; Triton
Wars è strettamente 1v1, quindi l'orchestrator blocca il primo "hello" come
partner e risponde a chiunque altro con `roomFull` mirato (con `stage`
'pending' o 'locked' a seconda che l'host abbia già premuto Inizia).

**Vittoria fantasma — guard.** Un peer che droppa o forfeita prima del primo
tiro non incorona più il giocatore locale: i gate
`session.phase === 'playing'` + almeno uno shot loggato bloccano lo
`showGameOver` e mostrano un banner "Avversario non disponibile" con ritorno
al menu.

**WebView in-app iOS.** All'avvio si rileva il browser shell (FB, Instagram,
WhatsApp, Telegram, Slack, Discord, Apple Mail, Gmail iOS, …) e si mostra un
banner sticky "Apri in Safari" dismissable per 7 giorni via `localStorage`.
Il render loop installa anche handler `webglcontextlost/restored` per
recuperare da context loss tipici dei WKWebView.

## Roadmap

- [x] Fase 1 — fondamenta: scena 3D, griglia, PWA shell, deploy
- [x] Fase 2 — gameplay singleplayer + IA base
- [x] Fase 3 — multiplayer P2P con codice stanza
- [x] Fase 3.1 — hotfix online: invite flow, hard-cap, banner riconnessione, WebView guard
- [ ] Fase 4 — rifinitura: tutorial, FFA, post-processing
- [ ] Fase 5 — lancio: README con GIF, link da `alessandropezzali.it`

## Licenza

[MIT](./LICENSE) © 2026 Alessandro Pezzali
