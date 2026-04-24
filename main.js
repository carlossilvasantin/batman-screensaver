const { app, BrowserWindow, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { deflateSync } = require('zlib');
require('dotenv').config();

let windows = [];
let screensaverActive = false;
let currentMode = 'individual';

// ─── Window Management ────────────────────────────────────────────────────────

function createWindows() {
  const displays = screen.getAllDisplays();
  console.log(`[App] ${displays.length} pantalla(s) detectada(s)`);

  displays.slice(0, 9).forEach((display, index) => {
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      show: false,
      skipTaskbar: true,
      backgroundColor: '#000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    windows.push({ win, display, index });
  });
}

function broadcast(data) {
  windows.forEach(({ win, index }) => {
    if (!win.isDestroyed()) {
      win.webContents.send('command', {
        ...data,
        screenIndex: index,
        totalScreens: windows.length,
      });
    }
  });
}

function sendToScreen(screenIndex, data) {
  const target = windows[screenIndex];
  if (target && !target.win.isDestroyed()) {
    target.win.webContents.send('command', {
      ...data,
      screenIndex,
      totalScreens: windows.length,
    });
  }
}

function activate(mode) {
  if (mode) currentMode = mode;
  screensaverActive = true;
  const startTime = Date.now();

  windows.forEach(({ win, display, index }) => {
    win.setBounds(display.bounds);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.show();
    win.focus();
    if (!win.isDestroyed()) {
      win.webContents.send('command', {
        action: 'activate',
        mode: currentMode,
        screenIndex: index,
        totalScreens: windows.length,
        startTime,
      });
    }
  });

  console.log(`[App] Activado — modo: ${currentMode} — ${windows.length} pantallas`);
  updateTrayMenu();
}

function deactivate() {
  screensaverActive = false;
  broadcast({ action: 'deactivate' });
  setTimeout(() => {
    windows.forEach(({ win }) => {
      if (!win.isDestroyed()) {
        win.setAlwaysOnTop(false);
        win.hide();
      }
    });
  }, 600);
  console.log('[App] Desactivado');
  updateTrayMenu();
}

function changeMode(mode) {
  currentMode = mode;
  if (screensaverActive) broadcast({ action: 'setMode', mode });
}

// ─── Telegram Bot ─────────────────────────────────────────────────────────────

function startBot() {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) {
    console.warn('[Bot] Sin TELEGRAM_TOKEN en .env — bot desactivado');
    return;
  }

  // Import here so app boots even without the package installed yet
  const TelegramBot = require('node-telegram-bot-api');
  const bot = new TelegramBot(token, { polling: true });
  const allowedId = process.env.TELEGRAM_CHAT_ID;

  const ok = (msg) => !allowedId || String(msg.chat.id) === String(allowedId);
  const say = (msg, text) =>
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });

  const MODOS = ['individual', 'unificado', 'batsignal', 'lluvia'];

  bot.onText(/\/(start|ayuda)/, (msg) => {
    if (!ok(msg)) return;
    say(
      msg,
      '🦇 *AdmiraBot — Batman Screensaver*\n\n' +
        '`/activar` — Activar en todas las pantallas\n' +
        '`/activar [modo]` — Activar con modo concreto\n' +
        '`/desactivar` — Apagar screensaver\n' +
        '`/modo [nombre]` — Cambiar modo en caliente:\n' +
        '  • `individual` — Cada pantalla independiente\n' +
        '  • `unificado` — Gotham panorámica en las 9\n' +
        '  • `batsignal` — Señal que barre entre pantallas\n' +
        '  • `lluvia` — Murciélagos en cascada\n' +
        '`/pantalla [1-9] [modo]` — Controlar una pantalla\n' +
        '`/estado` — Estado actual'
    );
  });

  bot.onText(/\/activar(?:\s+(\w+))?/, (msg, match) => {
    if (!ok(msg)) return;
    const mode = match[1]?.toLowerCase();
    if (mode && !MODOS.includes(mode)) {
      say(msg, `Modo desconocido. Usa: ${MODOS.join(', ')}`);
      return;
    }
    activate(mode);
    say(msg, `🦇 Screensaver activado — modo *${currentMode}* — ${windows.length} pantallas`);
  });

  bot.onText(/\/desactivar/, (msg) => {
    if (!ok(msg)) return;
    deactivate();
    say(msg, '💡 Screensaver desactivado');
  });

  bot.onText(/\/modo\s+(\w+)/, (msg, match) => {
    if (!ok(msg)) return;
    const mode = match[1].toLowerCase();
    if (!MODOS.includes(mode)) {
      say(msg, `Modos disponibles: ${MODOS.join(', ')}`);
      return;
    }
    changeMode(mode);
    say(msg, `🎬 Modo cambiado a *${mode}*`);
  });

  bot.onText(/\/pantalla\s+(\d+)\s+(\w+)/, (msg, match) => {
    if (!ok(msg)) return;
    const idx = parseInt(match[1]) - 1;
    const mode = match[2].toLowerCase();
    if (idx < 0 || idx >= windows.length) {
      say(msg, `Pantalla inválida. Rango: 1-${windows.length}`);
      return;
    }
    if (!MODOS.includes(mode)) {
      say(msg, `Modo desconocido. Usa: ${MODOS.join(', ')}`);
      return;
    }
    sendToScreen(idx, { action: 'setMode', mode });
    say(msg, `🖥️ Pantalla ${match[1]} → modo *${mode}*`);
  });

  bot.onText(/\/estado/, (msg) => {
    if (!ok(msg)) return;
    say(
      msg,
      `🦇 *Estado actual*\n` +
        `• Screensaver: ${screensaverActive ? '✅ Activo' : '❌ Inactivo'}\n` +
        `• Modo: \`${currentMode}\`\n` +
        `• Pantallas: ${windows.length}`
    );
  });

  bot.on('polling_error', (err) => console.error('[Bot] Error:', err.message));

  console.log('[Bot] AdmiraBot conectado ✓');
}

// ─── Tray Icon ────────────────────────────────────────────────────────────────

function makeBatPNG() {
  // 32×32 golden bat silhouette on transparent background
  const W = 32, H = 32;
  const ROWS = [
    0x00000000, 0x00000000,
    0x000C3000, // ear tips
    0x001E7800, // ears wider
    0x003FFC00, // head solid
    0x0FBFFDF0, // wings start
    0x3FFFFFFC,
    0x7FFFFFFE,
    0xFFFFFFFF, // full width
    0xFFFFFFFF,
    0x7FFFFFFE,
    0x3FFFFFFC,
    0x1FFFFFF8,
    0x0FFFFFF0,
    0x07FFFFE0,
    0x03FFFFC0,
    0x00FFFF00,
    0x003FFC00,
    0x000FF000,
    0x0007E000,
    0x0003C000,
    0x00018000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x00000000,
  ];

  const raw = Buffer.alloc(H * (1 + W * 4), 0);
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    const mask = ROWS[y] >>> 0;
    for (let x = 0; x < W; x++) {
      if ((mask >>> (31 - x)) & 1) {
        const o = y * (1 + W * 4) + 1 + x * 4;
        raw[o] = 0xFF; raw[o+1] = 0xD7; raw[o+2] = 0x00; raw[o+3] = 0xFF;
      }
    }
  }

  const compressed = deflateSync(raw);

  // CRC32
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[i] = c;
  }
  const crc32 = (buf) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };

  const chunk = (type, data) => {
    const tb = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.allocUnsafe(4); lenBuf.writeUInt32BE(data.length);
    const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([tb, data])));
    return Buffer.concat([lenBuf, tb, data, crcBuf]);
  };

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let tray = null;

function setupTray() {
  const icon = nativeImage.createFromBuffer(makeBatPNG());
  tray = new Tray(icon);
  tray.setToolTip('Batman Screensaver — YarigAiBot');
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const MODOS = ['individual', 'unificado', 'batsignal', 'lluvia'];
  const modeItems = MODOS.map((m) => ({
    label: m.charAt(0).toUpperCase() + m.slice(1),
    type: 'radio',
    checked: currentMode === m,
    click: () => { changeMode(m); updateTrayMenu(); },
  }));

  const menu = Menu.buildFromTemplate([
    {
      label: screensaverActive ? '⬛  Desactivar' : '🦇  Activar',
      click: () => { screensaverActive ? deactivate() : activate(); updateTrayMenu(); },
    },
    { type: 'separator' },
    { label: 'Modo:', enabled: false },
    ...modeItems,
    { type: 'separator' },
    { label: 'Salir', click: () => app.exit(0) },
  ]);

  tray.setContextMenu(menu);
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindows();
  setupTray();
  startBot();
  console.log('[App] Listo. Icono en la bandeja del sistema ✓');
});

// Keep app running in background (no dock/taskbar quit)
app.on('window-all-closed', (e) => e.preventDefault());
