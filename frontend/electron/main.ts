/**
 * Electron main process — Atelier Nova TryOn desktop wrapper.
 * Multi-platform: Windows, macOS, Linux.
 *
 * In dev: loads http://localhost:5173 (Vite dev server).
 * In prod: loads dist/index.html via file://.
 *
 * Design choices:
 *   - Single window (kiosk-capable for 35″–85″ boutique displays).
 *   - contextIsolation: true, nodeIntegration: false (security).
 *   - preload.ts exposes only the safe `nova` IPC surface.
 */
import { app, BrowserWindow, shell, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#faf8f5",
    title: "Atelier Nova — Try then Buy",
    autoHideMenuBar: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Strip default menu (kiosk-friendly)
  Menu.setApplicationMenu(null);

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  // Open external links in the OS browser, not inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Security: block any navigation to unknown origins
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (e, url) => {
    const allowed = isDev
      ? url.startsWith("http://localhost:5173")
      : url.startsWith("file://");
    if (!allowed) e.preventDefault();
  });
});
