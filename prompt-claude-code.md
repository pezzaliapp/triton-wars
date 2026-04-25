# Prompt per Claude Code — Progetto "Triton Wars" (PWA 3D)

## 🎯 Obiettivo

Crea da zero una **Progressive Web App (PWA) gratuita** che reinventi la battaglia navale in chiave moderna e tridimensionale, con combattimento su **tre teatri**: superficie navale, profondità sottomarine, spazio aereo.

- **Repo GitHub:** `PezzaliAPP/triton-wars` (sotto l'account `PezzaliAPP`)
- **Dominio finale:** sottocartella o sottodominio di `alessandropezzali.it` (es. `alessandropezzali.it/triton-wars/`)
- **Costo:** zero. Niente API a pagamento, niente backend a pagamento, niente chiavi che scadano.
- **Hosting:** GitHub Pages (statico) + servizi gratuiti per il multiplayer.

---

## 🧱 Stack tecnico (vincoli)

Tutto il progetto deve usare solo strumenti **open source e gratuiti**:

- **Linguaggi:** TypeScript + HTML + CSS (no framework pesanti lato UI; usa Vite come bundler)
- **3D engine:** [Three.js](https://threejs.org/) (rendering WebGL2)
- **Fisica leggera:** `cannon-es` o calcoli geometrici custom (decidi tu in base a peso bundle)
- **UI HUD:** Web Components o piccolo wrapper React (massimo 200 KB gz totali)
- **PWA:** `vite-plugin-pwa` con Workbox per service worker, manifest, icone, offline mode
- **Multiplayer:** WebRTC peer-to-peer tramite [PeerJS](https://peerjs.com/) (server pubblico gratuito) **o** [Trystero](https://github.com/dmotz/trystero) (matchmaking gratuito su BitTorrent/Nostr/Firebase free tier)
- **Matchmaking globale:** stanze pubbliche con codice condivisibile + lobby leggera. Se serve persistenza minima, usa **Supabase free tier** (50.000 righe, 500 MB) o **Firebase free tier (Spark Plan)** — solo per lista lobby aperte, non per stato di gioco.
- **Audio:** Web Audio API + asset CC0 (es. da freesound.org o opengameart.org)
- **Asset 3D:** modelli low-poly auto-generati o CC0 (Quaternius, Kenney.nl)
- **CI/CD:** GitHub Actions → deploy automatico su GitHub Pages a ogni push su `main`
- **Test:** Vitest + Playwright per smoke test PWA

⚠️ **Vietato:** OpenAI/Anthropic API a pagamento, Google Maps, Mapbox a pagamento, AWS/Heroku a pagamento, asset con licenze ambigue.

---

## 🎮 Design del gioco

### Concept
Tre flotte, tre dimensioni, una griglia 3D. Il giocatore piazza unità su una **scacchiera volumetrica** divisa in tre strati:

1. **Strato AEREO** (sopra il livello del mare): caccia, droni, dirigibili da ricognizione
2. **Strato NAVALE** (in superficie): portaerei, incrociatori, cacciatorpediniere
3. **Strato SOTTOMARINO** (sotto il mare): sommergibili, mine, sonar

La griglia base consigliata è **10×10×6** (X, Y, Z) con i tre strati su Z. Il volume di gioco si vede in 3D ruotabile con drag/touch.

### Unità (esempio bilanciato — tu puoi rifinire)
| Strato | Unità | Celle | Abilità speciale |
|---|---|---|---|
| Aereo | Caccia | 1 | Si muove di 1 cella per turno |
| Aereo | Bombardiere | 2 | Colpo ad area 1×2 |
| Aereo | Drone ricognitore | 1 | Rivela 1 cella nemica/turno |
| Navale | Portaerei | 5 | Lancia 1 caccia se distrutta non recupera |
| Navale | Incrociatore | 4 | Colpo doppio ogni 3 turni |
| Navale | Cacciatorpediniere | 3 | Antisom: rivela sub adiacenti |
| Sottomarino | Sommergibile | 3 | Si sposta 1 cella ogni 2 turni |
| Sottomarino | Mina | 1 | Esplode se colpita, danno 3×3 superficie |

### Modalità di gioco
1. **Singolo vs IA** — 3 livelli (Recluta / Veterano / Ammiraglio). L'IA usa euristica probabilistica + pattern di hunt/target (no ML pesante).
2. **1 vs 1 online** — match con codice stanza condivisibile via link (es. `?room=ABC123`).
3. **Free-for-all 3-4 giocatori** — partita a turni, ultimo in piedi vince.
4. **Modalità rapida** — griglia 6×6×3, partite da 5 minuti.
5. **Tutorial interattivo** alla prima apertura.

### Controlli
- Desktop: mouse drag per ruotare la scena, click per selezionare cella, scroll per zoom.
- Mobile: touch drag rotazione, tap selezione, pinch zoom. **Layout completamente responsive.**
- Accessibilità: tastiera (frecce + invio), screen reader-friendly per HUD, contrasto AA.

---

## 🌐 Architettura multiplayer (gratis e robusta)

```
[Player A browser] <---WebRTC P2P---> [Player B browser]
        ↓                                    ↓
        └──────► PeerJS public broker ◄─────┘
                 (solo segnalazione iniziale)
```

- Niente server di stato di gioco: tutto lo stato viaggia P2P via DataChannel.
- **Anti-cheat minimo:** stato della griglia di ogni giocatore restano private nel browser di quel giocatore; si trasmettono solo i tiri e le risposte (hit/miss/affondato). Validazione basata su commit hash all'inizio del match (commitment scheme: SHA-256 del piazzamento + nonce, rivelato a fine partita).
- **Lobby pubblica opzionale:** mini-lista di stanze aperte salvata su Supabase free tier o, in alternativa, semplice "join via codice" senza lobby.
- **Riconnessione:** se la connessione cade, salva lo stato locale in IndexedDB e tenta reconnect automatico per 60 secondi.

---

## 📱 Requisiti PWA

- `manifest.webmanifest` completo (nome, short_name, theme_color, icone 192/512/maskable)
- Service Worker con Workbox: precache shell + asset 3D core, runtime cache per modelli aggiuntivi
- **Installabile** su iOS, Android, desktop (Chrome/Edge)
- **Funziona offline** in modalità singolo vs IA
- Splash screen, status bar coerente
- Lighthouse PWA score ≥ 95

---

## 📁 Struttura repo

```
triton-wars/
├── public/
│   ├── icons/               # PWA icons
│   ├── models/              # GLTF low-poly
│   └── sounds/              # SFX CC0
├── src/
│   ├── main.ts              # entry
│   ├── game/
│   │   ├── engine/          # Three.js scene, camera, controls
│   │   ├── grid/            # logica griglia 3D
│   │   ├── units/           # definizioni unità
│   │   ├── ai/              # IA singleplayer
│   │   └── rules/           # regole di gioco, validazione
│   ├── net/
│   │   ├── peer.ts          # wrapper PeerJS/Trystero
│   │   ├── protocol.ts      # messaggi tipizzati
│   │   └── lobby.ts         # matchmaking
│   ├── ui/
│   │   ├── hud/
│   │   ├── menu/
│   │   └── tutorial/
│   ├── pwa/
│   │   └── sw-registration.ts
│   └── styles/
├── tests/
├── .github/workflows/deploy.yml
├── vite.config.ts
├── package.json
├── README.md                # ricco, con screenshot e badge
└── LICENSE                  # MIT
```

---

## 🚀 Deploy

1. GitHub Actions: build su push → deploy su branch `gh-pages`.
2. Configura `base` in `vite.config.ts` per il path corretto (es. `/triton-wars/`).
3. Su `alessandropezzali.it` aggiungi un link/iframe o configura un sottodominio CNAME `gioco.alessandropezzali.it` puntato a GitHub Pages.
4. Aggiungi file `CNAME` nel repo se si usa dominio custom.

---

## 📋 Piano di sviluppo (incrementale, ogni step deve essere giocabile)

### Fase 1 — Fondamenta (giorno 1-2)
- Setup Vite + TypeScript + Three.js
- Scena 3D base con griglia volumetrica visibile
- Camera orbit + controlli touch/mouse
- PWA scaffolding (manifest + SW vuoto)
- CI/CD GitHub Pages funzionante

### Fase 2 — Gameplay singleplayer (giorno 3-5)
- Piazzamento unità con drag & drop 3D
- Logica turni + hit detection
- IA livello base (random + hunt mode)
- HUD: turno, unità rimaste, log azioni
- Audio SFX

### Fase 3 — Multiplayer P2P (giorno 6-8)
- Integrazione PeerJS
- Protocollo messaggi (TypeScript types condivisi)
- Stanza con codice condivisibile via URL
- Riconnessione + commit/reveal anti-cheat

### Fase 4 — Rifinitura (giorno 9-10)
- Tutorial interattivo
- Tre livelli IA
- Modalità free-for-all 3-4 giocatori
- Animazioni esplosioni, particelle, post-processing leggero
- Test Lighthouse, ottimizzazione bundle (target < 1.5 MB gz iniziale)

### Fase 5 — Lancio
- README con GIF demo
- Screenshot per i social
- Link da `alessandropezzali.it`

---

## ✅ Criteri di accettazione

- [ ] Giocabile offline in singleplayer dopo prima visita
- [ ] Match 1v1 online funziona tra due browser su reti diverse senza configurazione
- [ ] Lighthouse: Performance ≥ 85, PWA ≥ 95, Accessibility ≥ 90
- [ ] Bundle iniziale < 1.5 MB gzipped
- [ ] Funziona su iPhone Safari, Android Chrome, desktop Chrome/Firefox/Safari
- [ ] Zero costi ricorrenti
- [ ] Codice TypeScript senza `any` impliciti
- [ ] README chiaro con istruzioni `npm install && npm run dev`
- [ ] Licenza MIT

---

## 🧠 Istruzioni operative per Claude Code

1. **Inizializza il repo** in locale, poi push su `https://github.com/PezzaliAPP/triton-wars`.
2. **Lavora in branch piccoli**: una fase del piano = un branch + PR.
3. **Commit messaggi** in inglese, format Conventional Commits (`feat:`, `fix:`, `chore:`).
4. **Prima di ogni fase**, mostrami il piano dei file che creerai/modificherai e attendi conferma se la modifica è ampia.
5. **Genera asset placeholder** (cubi colorati low-poly) finché non ho fornito modelli definitivi — il gioco deve essere giocabile anche senza asset finali.
6. **Documenta nel README** ogni servizio esterno usato e come sostituirlo.
7. **Non introdurre dipendenze pesanti** senza giustificazione (regola: ogni nuova dep > 50 KB gz va motivata in PR).
8. **Test minimi**: smoke test che la home carichi, la PWA sia installabile, una partita singleplayer arrivi alla fine.

Quando sei pronto, parti dalla **Fase 1** e fammi vedere il primo commit funzionante deployato su GitHub Pages.
