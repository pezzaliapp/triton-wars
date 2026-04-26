import './styles/main.css';

import { createScene } from './game/engine/scene';
import { createOrbitControls } from './game/engine/controls';
import { createVolumetricGrid, GRID_DIMENSIONS } from './game/grid/volumetric-grid';
import { registerServiceWorker } from './pwa/sw-registration';

import { AppState, type Difficulty, isInMatch } from './app/app-state';
import { MatchController } from './app/match-controller';
import { OnlineMatchController } from './app/online-match-controller';
import { createMainMenu, type MainMenu } from './ui/menu/main-menu';
import { showHowToPlay, hasSeenHowTo } from './ui/menu/how-to-play';
import { showExitConfirm } from './ui/menu/exit-confirm';
import { setMuted } from './game/audio/sfx';
import { showLobbyChooser } from './ui/online/lobby-chooser';
import { showLobbyCreate } from './ui/online/lobby-create';
import { showLobbyJoin } from './ui/online/lobby-join';
import { showLobbyConnecting, type LobbyConnecting } from './ui/online/lobby-connecting';
import { OnlineOrchestrator } from './net/online-orchestrator';
import { createTrysteroTransport } from './net/transport';
import { readRoomFromUrl } from './ui/online/room-code';
import type { GameState } from './game/state/game-state';
import type { Side } from './net/protocol';

const canvasEl = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvasEl) throw new Error('canvas #scene not found');
const canvas: HTMLCanvasElement = canvasEl;

const sceneCtx = createScene(canvas);
sceneCtx.scene.add(createVolumetricGrid(GRID_DIMENSIONS));
const orbit = createOrbitControls(sceneCtx.camera, canvas);

const tick = (): void => {
  orbit.update();
  sceneCtx.render();
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

registerServiceWorker();

// ---- App orchestration ---------------------------------------------------

const APP_ID = 'triton-wars';
const NICK = `Pilota-${Math.floor(Math.random() * 9000 + 1000)}`;

const app = new AppState();
let menu: MainMenu | null = null;
let match: MatchController | null = null;
let onlineMatch: OnlineMatchController | null = null;
let connectingScreen: LobbyConnecting | null = null;
/** Reference to the GameState owned by the active OnlineMatchController.
 * Captured here so the orchestrator's resolveAttack/getOwnUnits closures
 * (constructed *before* the match controller) can read the live state. */
let onlineState: GameState | null = null;
let muted = false;

function showMenu(): void {
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
  // Deep-link via ?room=... auto-routes to "join" with prefilled code.
  const fromUrl = readRoomFromUrl();
  if (fromUrl) {
    void connectToRoom(fromUrl);
    return;
  }
  showLobbyChooser({
    onCreate: () => openCreateScreen(),
    onJoin: () => openJoinScreen(),
    onCancel: () => showMenu(),
  });
}

function openCreateScreen(): void {
  showLobbyCreate({
    onStart: (code) => void connectToRoom(code, 'host'),
    onCancel: () => showMenu(),
  });
}

function openJoinScreen(): void {
  showLobbyJoin({
    onJoin: (code) => void connectToRoom(code, 'guest'),
    onCancel: () => showMenu(),
  });
}

async function connectToRoom(roomCode: string, sideHint?: Side): Promise<void> {
  // Show the connecting overlay immediately so the user sees feedback.
  connectingScreen?.destroy();
  connectingScreen = showLobbyConnecting({
    roomCode,
    onCancel: () => showMenu(),
  });

  // The 'host' vs 'guest' role only matters for tie-breaking display
  // (Trystero peers are symmetric). If unspecified (deep link), default
  // to 'guest' since deep links typically come from a host who shared.
  const side: Side = sideHint ?? 'guest';

  let transport: Awaited<ReturnType<typeof createTrysteroTransport>>;
  try {
    transport = await createTrysteroTransport({ appId: APP_ID, roomId: roomCode });
  } catch (err) {
    connectingScreen.setStatus('failed', err instanceof Error ? err.message : String(err));
    return;
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

  // Hand off to the OnlineMatchController as soon as the peer is found —
  // we keep the connecting overlay visible until the orchestrator reaches
  // the placing phase (both committed).
  let handoffDone = false;
  const handoff = (): void => {
    if (handoffDone) return;
    handoffDone = true;
    connectingScreen?.destroy();
    connectingScreen = null;
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

  const unsub = orchestrator.subscribe((e) => {
    if (handoffDone) return;
    switch (e.kind) {
      case 'opponentReady':
        connectingScreen?.setStatus('peer-found');
        // Once the opponent says hello, transition to placement —
        // commit happens after the player confirms their fleet.
        handoff();
        unsub();
        return;
      case 'transportError':
        connectingScreen?.setStatus('failed', e.error.message);
        unsub();
        return;
      default:
        return;
    }
  });
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
  if (connectingScreen) {
    connectingScreen.destroy();
    connectingScreen = null;
  }
  if (menu) {
    menu.destroy();
    menu = null;
  }
}

// Boot
showMenu();
if (!hasSeenHowTo()) {
  showHowToPlay({ onClose: () => {}, preferSuppressOnFirstView: true });
}
