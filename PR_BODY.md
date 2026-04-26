# Phase 3.1 hotfix: invite flow + hard-cap + phantom guard + WebView

## Summary

Six bugs fixed in the online flow shipped with Phase 3, organised in eight semantic commits on `feature/phase-3-1-hotfix`. The lobby state machine is now explicit (`awaiting-guest → guest-pending → match-starting → placing → playing → ended`) and every "silent failure" path the previous flow had — phantom victory on early disconnect, mystery freezes on iOS WebViews, third peers crashing the room, deep-link guests dropped into a spinner with no context — now surfaces a clear UI state with a clean route back to the menu.

## Fixes (8 commits, in merge order)

| # | Commit | Fix |
|---|---|---|
| 1 | `9e76ad0` `feat(net):` | **Bug 3 — Hard-cap 2 peers + roomFull + partner lock.** Orchestrator locks `partnerPeerId` on the first hello and rejects anyone else with a targeted `roomFull` frame carrying `stage: 'pending' \| 'locked'` so the rejected UI can differentiate "host is evaluating" vs "match already started". Adds `signalStartMatch` / `signalStandby` and the matchStarting / standby / thirdPeerRejected / rejectedByPeer events used by Bug 6. |
| 2 | `703c00d` `feat(net):` | **Bug 2 — Triple-guard phantom victory + DisconnectedBanner.** `opponentForfeit` and `reconnectExpired` now route through a guard that requires `session.phase === 'playing'` AND ≥1 shot logged on either side. If the guard fails (peer dropped before any shot), a new `DisconnectedBanner` explains what happened and routes back to the menu instead of declaring a fake "Hai vinto". Also covers `rejectedByPeer` with two distinct strings (pending vs locked). |
| 3 | `a66e50b` `feat(net,ui):` | **Bug 4 — Heartbeat banner with N/threshold counter.** `ReconnectController` now emits `heartbeatMissed{missed,threshold}` on every missed pong (not only at the unresponsive threshold) and re-emits `peerResponsive` on any pong recovery — even before the threshold — so the new top-center high-contrast `ReconnectingBanner` updates in place (`1/3 → 2/3 → 3/3`) and auto-dismisses with a green "Riconnesso!" flash. |
| 4 | `6e27303` `feat(pwa):` | **Bug 1 — WebView detection + sticky banner + GL context-loss recovery.** UA detection covers FB, Instagram, WhatsApp, LINE, WeChat, Twitter, LinkedIn, KakaoTalk, Slack, Discord, Telegram in-app, GSA, Gmail iOS, plus an "iOS without Safari" heuristic for unbranded WKWebView shells (Apple Mail, etc.). Sticky non-blocking "Apri in Safari" banner, dismissable for 7 days via `localStorage`. Plus `webglcontextlost`/`webglcontextrestored` handlers on the canvas so a tab/app suspend doesn't permanently freeze the scene. |
| 5 | `1737500` `chore(deps):` | **`qrcode-svg` for the invite QR.** Lazy-imported on demand (only when the host expands "Mostra QR"), pure JS, ~3 KB gz, MIT. |
| 6 | `5e87b0e` `feat(ui):` | **Bug 5 + 6 — Invite flow + share + QR + clearer lobby labels.** GUEST: `?room=` deep link opens an `InviteDialog` ("Sei stato invitato!") with explicit Unisciti / Annulla; cancel strips `?room=` from the URL via `history.replaceState`. Connecting screen shows "In attesa che l'host inizi…" with a 30s host-confirm watchdog → "L'host non ha confermato" banner if nothing arrives. On `standby`, switches to "L'host sta valutando…" with a live mm:ss countdown to `expiresAt`. HOST: lobby create screen now shows a live "In attesa da X:YY…" timer, a `Condividi` button (`navigator.share` with copy fallback), and a collapsible QR panel. When the guest joins, `GuestPendingDialog` asks "Pronto a iniziare?" with `Inizia partita` / `Aspetta` — the room only locks (`signalStartMatch`) on Inizia. Aspetta sends a 60s standby signal. Lobby chooser relabel: "Crea partita" → "Invita un amico", "Unisciti" → "Ho ricevuto un codice". |
| 7 | `d2c1332` `test(net):` | **End-to-end coverage** for 3rd-peer rejection (`stage: 'pending'` and `'locked'` branches), `signalStartMatch` / `signalStandby` round-trip, `heartbeatMissed` 1/3 → 2/3 → 3/3, and pre-threshold `peerResponsive` recovery. The `LoopbackTransport` now buffers events that arrive before any listener subscribes so a third orchestrator constructed late in the test still sees the room state — without it, `peerJoin`/`message` frames fired into the void and the late peer would never lock or get rejected. |
| 8 | `2f92982` `docs:` | README — Phase 3.1 hotfix notes + bundle table. Also drops a redundant dynamic import of `room-code.ts` from `main.ts` that vite was warning about (the module was already statically imported by the lobby screens). |

**Total:** `61 tests passing` (up from 55), `npm run build` clean.

## Bundle (`npm run build`)

| Chunk | Raw | Gzip | When |
|---|---|---|---|
| main `index-*.js` | 572 KB | **147 KB** | always |
| `trystero` (lazy) | 48 KB | **18.5 KB** | entering online lobby |
| `qrcode-svg` (lazy) | 19 KB | **6.8 KB** | opening "Mostra QR" |
| `workbox` (PWA shell) | 5.7 KB | **2.4 KB** | always |
| CSS | 21 KB | **4.7 KB** | always |

- **Singleplayer first-paint** (no chunks loaded yet): ~154 KB gz
- **Online lobby** (trystero loaded, no QR): **~172 KB gz** — under the 175 KB target
- **With QR opened**: ~179 KB gz (only paid when the host clicks "Mostra QR")

## Test plan

Automated:

- [x] `npm test` — 9 files / 61 tests pass, including the new coverage listed under commit `d2c1332`
- [x] `npm run build` — clean (no dynamic+static import warning, no TS errors)

Manual smoke (please run before merge):

- [ ] **Invite — guest happy path**: open `https://…/triton-wars/?room=TRITON-…` in a fresh tab → "Sei stato invitato!" dialog appears → Unisciti → connecting screen says "In attesa che l'host inizi…"
- [ ] **Invite — guest cancel**: same setup, click Annulla → URL bar no longer contains `?room=` → page refresh does NOT re-open the dialog
- [ ] **Invite — host confirm**: from another tab/device, "Invita un amico" → guest joins → "Pronto a iniziare?" appears with Inizia / Aspetta → click Inizia → both sides switch to placement
- [ ] **Invite — host wait**: same setup → click Aspetta → guest sees "L'host sta valutando…" with a counting-down mm:ss → wait 60s → guest auto-disconnects with "L'host non ha avviato la partita"
- [ ] **Invite — host timeout**: guest joins, host walks away (don't click anything) for 30s → guest sees "L'host non ha confermato l'invito" + Torna al menu
- [ ] **Hard-cap**: open the same `?room=` link in a third browser tab while the first two are paired → 3rd tab sees "Stanza occupata" (pending) or "Stanza piena" (after host pressed Inizia)
- [ ] **Phantom victory guard — pre-play**: guest joins, host kills the tab BEFORE pressing Inizia → guest sees DisconnectedBanner ("Avversario non disponibile"), NOT a "Hai vinto" screen
- [ ] **Phantom victory guard — placement**: both committed via `Conferma flotta` but BEFORE first shot, guest closes tab → host sees DisconnectedBanner, NOT a victory
- [ ] **Heartbeat banner**: mid-match, kill the wifi for ~10s → top-center banner appears counting `1/3 → 2/3` → restore wifi → green "Riconnesso!" flash, banner closes
- [ ] **WebView banner — iOS**: open the deployed URL inside WhatsApp / Telegram / Instagram in-app browser on iOS → bottom banner "Apri in Safari" appears → tap close → reload → banner stays gone for 7 days
- [ ] **WebView banner — desktop Safari**: open in regular Safari on macOS / iPad-Safari → banner does NOT appear
- [ ] **GL context loss**: backgound the iOS Safari tab for ~30s, return → canvas keeps rendering (no permanent black frame)
- [ ] **Share button**: on mobile, tap "Condividi" → native share sheet opens with the room link
- [ ] **Share button — fallback**: on desktop where `navigator.share` is unavailable, tap "Condividi" → button text changes to "Copiato!" and the link is on the clipboard
- [ ] **QR**: tap "Mostra QR" → SVG renders within ~200ms → scan with another phone → opens the deep link

🤖 Generated with [Claude Code](https://claude.com/claude-code)
