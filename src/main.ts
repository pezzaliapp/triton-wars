import './styles/main.css';

import { createScene } from './game/engine/scene';
import { createOrbitControls } from './game/engine/controls';
import { createVolumetricGrid, GRID_DIMENSIONS } from './game/grid/volumetric-grid';
import { registerServiceWorker } from './pwa/sw-registration';
import {
  maybeShowWebViewBanner,
  installContextLossHandlers,
} from './pwa/webview-banner';

import { AppState, type Difficulty, isInMatch } from './app/app-state';
import { MatchController } from './app/match-controller';
import { OnlineMatchController } from './app/online-match-controller';
import { createMainMenu, type MainMenu } from './ui/menu/main-menu';
import { showHowToPlay, hasSeenHowTo } from './ui/menu/how-to-play';
import { showExitConfirm } from './ui/menu/exit-confirm';
import { setMuted } from './game/audio/sfx';
import { showLobbyChooser } from './ui/online/lobby-chooser';
import { showLobbyCreate, type LobbyCreate } from './ui/online/lobby-create';
import { showLobbyJoin } from './ui/online/lobby-join';
import { showLobbyConnecting, type LobbyConnecting } from './ui/online/lobby-connecting';
import { showInviteDialog } from './ui/online/invite-dialog';
import { showDisconnectedBanner } from './ui/online/disconnected-banner';
import { OnlineOrchestrator } from './net/online-orchestrator';
import { createTrysteroTransport } from './net/transport';
import { readRoomFromUrl, generateRoomCode } from './ui/online/room-code';
import type { GameState } from './game/state/game-state';
import type { Side } from './net/protocol';

const canvasEl = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvasEl) throw new Error('canvas #scene not found');
const canvas: HTMLCanvasElement = canvasEl;

const sceneCtx = createScene(canvas);
sceneCtx.scene.add(createVolumetricGrid(GRID_DIMENSIONS));
const orbit = createOrbitControls(sceneCtx.camera, canvas);

let renderingPaused = false;
const tick = (): void => {
  if (!renderingPaused) {
    orbit.update();
    sceneCtx.render();
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

// Recover gracefully from a WebGL context loss (common in iOS WebViews
// after a tab/app suspend). Without this the canvas freezes on a black
// frame and never repaints — we pause the loop on lost, resume on
// restored, and the renderer's internal state re-uploads on next draw.
installContextLossHandlers(canvas, {
  onLost: () => {
    renderingPaused = true;
  },
  onRestored: () => {
    renderingPaused = false;
  },
});

// In-app WebView banner ("Apri in Safari") — sticky non-blocking, dismissable
// for 7 days via localStorage. No-op on desktop / standalone Safari.
maybeShowWebViewBanner();

registerServiceWorker();

// ---- App orchestration ---------------------------------------------------

const APP_ID = 'triton-wars';
const NICK = `Pilota-${Math.floor(Math.random() * 9000 + 1000)}`;

const app = new AppState();
let menu: MainMenu | null = null;
let match: MatchController | null = null;
let onlineMatch: OnlineMatchController | null = null;
let connectingScreen: LobbyConnecting | null = null;
let hostLobbyScreen: LobbyCreate | null = null;
/** When the lobby is alive but the match controller hasn't been built yet
 * (still in lobby/awaiting-host-start phase), keep a tear-down hook here
 * so showMenu/teardownAll can drop the orchestrator + transport cleanly. */
let pendingLobbyTeardown: (() => Promise<void>) | null = null;
/** Reference to the GameState owned by the active OnlineMatchController.
 * Captured here so the orchestrator's resolveAttack/getOwnUnits closures
 * (constructed *before* the match controller) can read the live state. */
let onlineState: GameState | null = null;
let muted = false;

function showMenu(): void {
  // Destroy the old menu *synchronously* before starting teardownAll. The
  // old code relied on teardownAll being effectively-sync (no awaits hit
  // when nothing was pending), but PR #4 added `await teardownLobby()`,
  // which always yields. The microtask resumed after showMenu had already
  // created and appended the new menu — and teardownAll's tail
  // `if (menu) menu.destroy()` then ripped that fresh menu out of the DOM.
  if (menu) {
    menu.destroy();
    menu = null;
  }
  void teardownAll();
  app.exitToMenu();
  menu = createMainMenu({
    initialDifficulty: app.difficulty,
    onPlayVsComputer: (d) => startMatch(d),
    onPlayOnline: () => enterOnlineLobby(),
    onHowTo: () => showHowToPlay({ onClose: () => {} }),
  });
  document.body.appendChild(menu.el);
}

function startMatch(difficulty: Difficulty): void {
  if (menu) {
    menu.destroy();
    menu = null;
  }
  app.startMatch(difficulty);
  setMuted(muted);
  match = new MatchController({
    scene: sceneCtx.scene,
    camera: sceneCtx.camera,
    canvas,
    hudHost: document.body,
    difficulty,
    initialMuted: muted,
    onPlayBegan: () => app.beginPlay(),
    onExitRequest: handleExitRequest,
    onReturnToMenu: showMenu,
    onGameOver: (winner) => app.endMatch(winner),
    onMutedChange: (next) => {
      muted = next;
    },
  });
}

function handleExitRequest(): void {
  if (!isInMatch(app.mode)) return;
  showExitConfirm({
    onConfirm: () => showMenu(),
    onCancel: () => {},
  });
}

// ---- Online lobby + match ----------------------------------------------

function enterOnlineLobby(): void {
  if (menu) {
    menu.destroy();
    menu = null;
  }
  app.enterLobby();
  // Deep-link via ?room=...: present an explicit invite dialog before
  // connecting, so the guest knows what they are accepting.
  const fromUrl = readRoomFromUrl();
  if (fromUrl) {
    showInviteDialog({
      roomCode: fromUrl,
      onAccept: () => void connectAsGuest(fromUrl),
      onCancel: () => showMenu(),
    });
    return;
  }
  showLobbyChooser({
    onCreate: () => openCreateScreen(),
    onJoin: () => openJoinScreen(),
    onCancel: () => showMenu(),
  });
}

function openCreateScreen(): void {
  void connectAsHost();
}

function openJoinScreen(): void {
  showLobbyJoin({
    onJoin: (code) => void connectAsGuest(code),
    onCancel: () => showMenu(),
  });
}

/** Wall-clock ms a guest will wait for the host's startMatch/standby
 * before giving up and showing a "host non ha confermato" banner. */
const HOST_CONFIRM_TIMEOUT_MS = 30_000;
/** Duration the host puts the guest in stand-by when pressing "Aspetta". */
const STANDBY_DURATION_MS = 60_000;

async function connectAsHost(): Promise<void> {
  // Build the lobby screen first with a freshly generated code, then start
  // the transport using that same code. The screen owns the timer + share.
  const code = generateRoomCode();
  let orchestratorRef: OnlineOrchestrator | null = null;
  hostLobbyScreen?.destroy();
  hostLobbyScreen = showLobbyCreate({
    initialCode: code,
    onCancel: () => {
      void teardownLobby();
      showMenu();
    },
    onConfirmStart: () => orchestratorRef?.signalStartMatch(),
    onWait: () => orchestratorRef?.signalStandby(STANDBY_DURATION_MS),
  });
  orchestratorRef = await openOrchestrator(code, 'host');
}

async function connectAsGuest(roomCode: string): Promise<void> {
  connectingScreen?.destroy();
  connectingScreen = showLobbyConnecting({
    roomCode,
    onCancel: () => {
      void teardownLobby();
      showMenu();
    },
  });
  await openOrchestrator(roomCode, 'guest');
}

/**
 * Build the transport + orchestrator and wire it to the active lobby
 * screen for this side. Returns the orchestrator (or null on transport
 * failure — the lobby screen handles its own error state in that case).
 */
async function openOrchestrator(roomCode: string, side: Side): Promise<OnlineOrchestrator | null> {
  let transport: Awaited<ReturnType<typeof createTrysteroTransport>>;
  try {
    transport = await createTrysteroTransport({ appId: APP_ID, roomId: roomCode });
  } catch (err) {
    connectingScreen?.setStatus('failed', err instanceof Error ? err.message : String(err));
    return null;
  }

  const orchestrator = new OnlineOrchestrator({
    transport,
    side,
    nick: NICK,
    resolveAttack: (cell) => {
      if (!onlineState) return { result: 'miss', cascades: [] };
      const out = onlineState.applyIncomingShot(cell.layer, cell.x, cell.z);
      if (!out || out.result === 'already') return { result: 'miss', cascades: [] };
      return {
        result: out.result,
        cascades: out.cascades
          .filter((c) => c.result !== 'already')
          .map((c) => ({
            cell: c.cell,
            result: c.result as 'miss' | 'hit' | 'sunk',
            sunkType: c.sunkType,
          })),
      };
    },
    getOwnUnits: () => (onlineState ? onlineState.serializePlayerFleet() : []),
  });

  // Until handoff, the orchestrator + transport are owned by the lobby flow.
  // Track them so cancel/teardown can release sockets cleanly.
  let handoffDone = false;
  let hostConfirmTimer: number | null = null;
  let standbyExpireTimer: number | null = null;

  const clearTimers = (): void => {
    if (hostConfirmTimer !== null) {
      window.clearTimeout(hostConfirmTimer);
      hostConfirmTimer = null;
    }
    if (standbyExpireTimer !== null) {
      window.clearTimeout(standbyExpireTimer);
      standbyExpireTimer = null;
    }
  };

  const teardown = async (): Promise<void> => {
    clearTimers();
    pendingLobbyTeardown = null;
    if (!handoffDone) {
      await orchestrator.destroy();
    }
  };
  pendingLobbyTeardown = teardown;

  const showRejection = (reason: 'rejected-room-full' | 'rejected-room-pending' | 'host-confirm-timeout' | 'standby-expired' | 'opponent-left-before-play'): void => {
    void teardown();
    connectingScreen?.destroy();
    connectingScreen = null;
    hostLobbyScreen?.destroy();
    hostLobbyScreen = null;
    showDisconnectedBanner({
      reason,
      onReturnToMenu: showMenu,
    });
  };

  const handoffToMatch = (): void => {
    if (handoffDone) return;
    handoffDone = true;
    clearTimers();
    pendingLobbyTeardown = null;
    connectingScreen?.destroy();
    connectingScreen = null;
    hostLobbyScreen?.destroy();
    hostLobbyScreen = null;
    app.startOnlineMatch();
    setMuted(muted);
    onlineMatch = new OnlineMatchController({
      scene: sceneCtx.scene,
      camera: sceneCtx.camera,
      canvas,
      hudHost: document.body,
      initialMuted: muted,
      orchestrator,
      side,
      opponentNickHint: orchestrator.session.opponentNick ?? 'Avversario',
      onPlayBegan: () => app.beginPlay(),
      onExitRequest: handleExitRequest,
      onReturnToMenu: showMenu,
      onGameOver: (winner) => app.endMatch(winner),
      onMutedChange: (next) => {
        muted = next;
      },
      onVerification: () => {},
    });
    onlineState = onlineMatch.state;
  };

  orchestrator.subscribe((e) => {
    if (handoffDone) return;
    switch (e.kind) {
      case 'opponentReady':
        if (side === 'host') {
          hostLobbyScreen?.showGuestPending(e.nick);
        } else {
          connectingScreen?.setStatus('waiting-host-start');
          // Guest watchdog: if host doesn't press Inizia within 30s,
          // surface "L'host non ha confermato" instead of waiting forever.
          if (hostConfirmTimer === null) {
            hostConfirmTimer = window.setTimeout(() => {
              showRejection('host-confirm-timeout');
            }, HOST_CONFIRM_TIMEOUT_MS);
          }
        }
        return;

      case 'matchStarting':
        // Host pressed Inizia (or guest received the signal). Both sides
        // tear down the lobby chrome and switch to placement.
        handoffToMatch();
        return;

      case 'standby':
        // Guest only: host parked us in stand-by. Show countdown to
        // expiresAt; on expiry surface a clear banner and disconnect.
        if (side === 'guest') {
          if (hostConfirmTimer !== null) {
            window.clearTimeout(hostConfirmTimer);
            hostConfirmTimer = null;
          }
          connectingScreen?.setStatus('standby');
          connectingScreen?.setCountdown(e.expiresAt);
          if (standbyExpireTimer !== null) window.clearTimeout(standbyExpireTimer);
          const remainMs = Math.max(1000, e.expiresAt - Date.now());
          standbyExpireTimer = window.setTimeout(() => {
            showRejection('standby-expired');
          }, remainMs);
        }
        return;

      case 'rejectedByPeer':
        showRejection(e.stage === 'locked' ? 'rejected-room-full' : 'rejected-room-pending');
        return;

      case 'thirdPeerRejected':
        // Host just kicked a third peer — silent for now; UX is fine because
        // the rejected peer sees their own banner. Could surface a toast
        // later if telemetry shows it confuses hosts.
        return;

      case 'transportError':
        connectingScreen?.setStatus('failed', e.error.message);
        return;

      case 'peerLeft':
      case 'reconnectExpired':
        // Lobby-phase peer drop: no match yet, no winner — just notify.
        if (e.kind === 'reconnectExpired' && !handoffDone) {
          showRejection('opponent-left-before-play');
        }
        return;

      default:
        return;
    }
  });

  return orchestrator;
}

async function teardownLobby(): Promise<void> {
  if (pendingLobbyTeardown) {
    await pendingLobbyTeardown();
    pendingLobbyTeardown = null;
  }
  if (hostLobbyScreen) {
    hostLobbyScreen.destroy();
    hostLobbyScreen = null;
  }
  if (connectingScreen) {
    connectingScreen.destroy();
    connectingScreen = null;
  }
}

async function teardownAll(): Promise<void> {
  if (match) {
    match.destroy();
    match = null;
  }
  if (onlineMatch) {
    await onlineMatch.destroy();
    onlineMatch = null;
    onlineState = null;
  }
  await teardownLobby();
  // NOTE: do NOT destroy `menu` here — its lifecycle is owned by showMenu,
  // which destroys the previous menu synchronously before re-creating.
  // Touching it from here introduces a microtask race that wipes the menu
  // immediately after showMenu just appended it.
}

// Boot
showMenu();
if (!hasSeenHowTo()) {
  showHowToPlay({ onClose: () => {}, preferSuppressOnFirstView: true });
}
