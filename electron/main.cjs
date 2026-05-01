/**
 * CloudCLI Electron Main Process
 *
 * Responsibilities:
 *  1. Spawn the local Node.js server (server/index.js)
 *  2. Show a BrowserWindow loading the local server UI
 *  3. System tray icon with connection status
 *  4. Connect to remote VPS signaling server (/ws/device) and maintain heartbeat
 *  5. Handle WebRTC P2P connections from mobile devices
 *  6. Auto-start on system login (configurable)
 */

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  shell,
  ipcMain,
  nativeImage,
  dialog,
} = require('electron');
const path = require('path');
const { fork } = require('child_process');
const { randomUUID } = require('crypto');
const store = require('./store.cjs');
const DeviceWebRTC = require('./webrtc.cjs');

const LOCAL_PORT = process.env.SERVER_PORT || 3001;
const LOCAL_URL = `http://localhost:${LOCAL_PORT}`;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;
let tray = null;
let serverProcess = null;
let webrtc = null;
let deviceStatus = 'disconnected'; // 'connected' | 'disconnected' | 'error' | 'p2p-active'

// ─── Single Instance Lock ────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Local auth token (read from renderer after login; used to proxy P2P requests)
let localToken = '';

// ─── App Events ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Ensure a device ID exists
  if (!store.get('deviceId')) {
    store.set('deviceId', randomUUID());
  }
  if (!store.get('deviceName')) {
    store.set('deviceName', require('os').hostname());
  }
  // Auto-set Render server URL if not configured
  if (!store.get('serverUrl')) {
    store.set('serverUrl', 'https://cloudcli-server.onrender.com');
    console.log('[Main] Auto-configured serverUrl → Render');
  }

  await startLocalServer();
  createTray();
  createWindow();
  startSignaling();
  startKeepAlive();
  // Sync local token once after page loads
  ipcMain.handle('sync-local-token', (_event, token) => { localToken = token || ''; });

  // Auto-start config
  applyAutoStart();
});

app.on('window-all-closed', () => {
  // On macOS, keep app alive in tray
  if (process.platform !== 'darwin') {
    const minimize = store.get('minimizeToTray');
    if (!minimize) app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else mainWindow?.show();
});

app.on('before-quit', () => {
  webrtc?.stop();
  serverProcess?.kill();
});

// ─── Local Server ────────────────────────────────────────────────────────────
function startLocalServer() {
  return new Promise((resolve) => {
    const serverEntry = app.isPackaged
      ? path.join(process.resourcesPath, 'server', 'index.js')
      : path.join(__dirname, '..', 'dist-server', 'server', 'index.js');

    serverProcess = fork(serverEntry, [], {
      env: { ...process.env, SERVER_PORT: String(LOCAL_PORT), ELECTRON: '1' },
      silent: false,
    });

    serverProcess.once('message', (msg) => {
      if (msg === 'ready') resolve();
    });

    // Give the server 3 seconds to start regardless
    setTimeout(resolve, 3000);

    serverProcess.on('exit', (code) => {
      console.log('[Main] Server process exited with code', code);
      if (code !== 0 && !app.isQuitting) {
        console.log('[Main] Server crashed — restarting in 2s…');
        setTimeout(() => startLocalServer(), 2000);
      }
    });
  });
}

// ─── BrowserWindow ───────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'CloudCLI',
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(LOCAL_URL);

  mainWindow.on('close', (e) => {
    if (store.get('minimizeToTray') && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// ─── System Tray ─────────────────────────────────────────────────────────────
function createTray() {
  const icon = nativeImage.createFromPath(getIconPath());
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('CloudCLI — 远程控制');
  updateTrayMenu();

  tray.on('double-click', () => {
    mainWindow ? mainWindow.show() : createWindow();
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const statusLabel = {
    connected: '🟢 已连接到信令服务器',
    disconnected: '🔴 未连接',
    error: '🟠 连接错误',
    'p2p-active': '🔵 P2P 会话活跃',
  }[deviceStatus] ?? '⚪ 初始化中';

  const menu = Menu.buildFromTemplate([
    { label: 'CloudCLI 远程控制', enabled: false },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    {
      label: '打开界面',
      click: () => {
        mainWindow ? mainWindow.show() : createWindow();
      },
    },
    {
      label: '在浏览器中打开',
      click: () => shell.openExternal(LOCAL_URL),
    },
    { type: 'separator' },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: store.get('autoStart'),
      click: (item) => {
        store.set('autoStart', item.checked);
        applyAutoStart();
      },
    },
    {
      label: '关闭时最小化到托盘',
      type: 'checkbox',
      checked: store.get('minimizeToTray'),
      click: (item) => store.set('minimizeToTray', item.checked),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function setDeviceStatus(status) {
  deviceStatus = status;
  updateTrayMenu();
  mainWindow?.webContents.send('device-status', status);
}

// ─── Signaling + WebRTC ───────────────────────────────────────────────────────
function startSignaling() {
  const mode = store.get('connectionMode') || 'online';
  if (mode === 'offline') {
    console.log('[Main] Connection mode is offline — signaling disabled.');
    setDeviceStatus('disconnected');
    return;
  }

  const signalingToken = store.get('signalingToken');
  let serverUrl = store.get('serverUrl');

  if (mode === 'lan') {
    serverUrl = `http://127.0.0.1:${LOCAL_PORT}`;
  }

  const token = mode === 'lan' ? (localToken || store.get('token')) : signalingToken;

  if (!serverUrl || !token) {
    console.log('[Main] No signaling token configured. Log in first.');
    setDeviceStatus('disconnected');
    return;
  }

  webrtc = new DeviceWebRTC({
    serverUrl,
    token,
    deviceId: store.get('deviceId'),
    deviceName: store.get('deviceName'),
    platform: process.platform,
  });

  webrtc.on('status', (s) => {
    setDeviceStatus(s === 'connected' ? 'connected' : s);
  });

  webrtc.on('channel-open', (sessionId) => {
    setDeviceStatus('p2p-active');
    console.log('[Main] Mobile P2P channel open:', sessionId);
  });

  webrtc.on('channel-close', () => {
    // Check if any channels still open
    setDeviceStatus('connected');
  });

  webrtc.on('message', (sessionId, data) => {
    handleMobileMessage(sessionId, data);
  });

  webrtc.start();
}

function restartSignaling() {
  webrtc?.stop();
  webrtc = null;
  startSignaling();
}

// ─── Mobile Message Handler ───────────────────────────────────────────────────
const http = require('http');

function handleMobileMessage(sessionId, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  // Mobile requests the local server token so it can authenticate API calls
  if (msg.type === 'request-local-token') {
    webrtc?.send(sessionId, JSON.stringify({ type: 'local-token', token: localToken }));
    return;
  }

  // Port proxy: tunnel HTTP request to local service
  if (msg.type === 'http-request') {
    proxyHttpRequest(sessionId, msg);
    return;
  }

  // Forward all other messages to the local server via HTTP
  // (e.g. chat messages, file operations — the local server handles them)
  forwardToLocalServer(sessionId, msg);
}

function proxyHttpRequest(sessionId, msg) {
  const { requestId, port, method, path: reqPath, headers, body } = msg;

  // Inject local auth token for requests to the local server
  const enrichedHeaders = { ...(headers || {}) };
  if (localToken && !enrichedHeaders['authorization'] && !enrichedHeaders['Authorization']) {
    enrichedHeaders['authorization'] = `Bearer ${localToken}`;
  }

  const options = {
    hostname: '127.0.0.1',
    port,
    method: method || 'GET',
    path: reqPath || '/',
    headers: enrichedHeaders,
  };

  const req = http.request(options, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const bodyB64 = Buffer.concat(chunks).toString('base64');
      webrtc?.send(sessionId, JSON.stringify({
        type: 'http-response',
        requestId,
        status: res.statusCode,
        headers: res.headers,
        body: bodyB64,
      }));
    });
  });

  req.on('error', (err) => {
    webrtc?.send(sessionId, JSON.stringify({
      type: 'http-response',
      requestId,
      status: 502,
      headers: {},
      body: Buffer.from(`Service unavailable: ${err.message}`).toString('base64'),
    }));
  });

  if (body) req.write(Buffer.from(body, 'base64'));
  req.end();
}

function forwardToLocalServer(sessionId, msg) {
  // Relay control commands to the local server
  // This allows mobile to drive the local Claude CLI via DataChannel
  const payload = JSON.stringify({ ...msg, _session: sessionId });
  const options = {
    hostname: '127.0.0.1',
    port: LOCAL_PORT,
    method: 'POST',
    path: '/api/remote/command',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  };
  const req = http.request(options);
  req.on('error', () => {});
  req.write(payload);
  req.end();
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────
ipcMain.handle('get-config', () => ({
  serverUrl: store.get('serverUrl'),
  deviceId: store.get('deviceId'),
  deviceName: store.get('deviceName'),
  signalingToken: store.get('signalingToken'),
  connectionMode: store.get('connectionMode') || 'online',
  autoStart: store.get('autoStart'),
  minimizeToTray: store.get('minimizeToTray'),
}));

ipcMain.handle('set-config', (_event, data) => {
  const keys = ['serverUrl', 'token', 'signalingToken', 'connectionMode', 'deviceName', 'autoStart', 'minimizeToTray'];
  for (const k of keys) {
    if (data[k] !== undefined) store.set(k, data[k]);
  }
  applyAutoStart();
  restartSignaling();
  return true;
});

ipcMain.handle('get-device-status', () => deviceStatus);

ipcMain.handle('open-external', (_event, url) => shell.openExternal(url));

// ─── Keep-Alive ──────────────────────────────────────────────────────────────
function startKeepAlive() {
  const INTERVAL = 14 * 60 * 1000; // 14 minutes
  const ping = () => {
    const url = store.get('serverUrl');
    if (!url) return;
    const target = `${url}/health`;
    const mod = target.startsWith('https') ? require('https') : require('http');
    const req = mod.get(target, (res) => {
      console.log(`[KeepAlive] ${target} → ${res.statusCode}`);
      res.resume();
    });
    req.on('error', (e) => console.log('[KeepAlive] ping failed:', e.message));
    req.end();
  };
  ping(); // immediate first ping
  setInterval(ping, INTERVAL);
}

// ─── Auto Start ──────────────────────────────────────────────────────────────
function applyAutoStart() {
  if (process.platform === 'linux') return; // handled via .desktop file / systemd
  app.setLoginItemSettings({
    openAtLogin: store.get('autoStart'),
    openAsHidden: true,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getIconPath() {
  const base = isDev ? path.join(__dirname, '..', 'public') : process.resourcesPath;
  // Prefer platform-specific icon
  const candidates = [
    path.join(base, `logo-${process.platform}.png`),
    path.join(base, 'logo-256.png'),
    path.join(base, 'logo.svg'),
  ];
  for (const p of candidates) {
    if (require('fs').existsSync(p)) return p;
  }
  return candidates[1]; // fallback even if missing
}
