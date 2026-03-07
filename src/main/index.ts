// Electron main process entry point

import { app, BrowserWindow } from "electron";
import path from "path";
import { initStorage } from "./storage.js";
import { initConfig, getConfig } from "./config.js";
import { registerIpcHandlers } from "./ipc.js";
import { startOllamaServe, stopOllamaServe } from "./ollama.js";

const isDev = !app.isPackaged;
const rootDir = app.getAppPath();

function createWindow(): BrowserWindow {
  const preloadPath = path.join(rootDir, "dist", "preload", "index.js");
  console.log("[main] preload path:", preloadPath);

  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: "Flashcard App",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(rootDir, "dist", "renderer", "index.html"));
  }

  return mainWindow;
}

app.whenReady().then(async () => {
  const appDataPath = app.getPath("appData");

  // Init storage and config (config must be first — ollama uses it)
  initStorage(appDataPath);
  initConfig(appDataPath);

  const mainWindow = createWindow();
  registerIpcHandlers();

  // Auto-start Ollama if configured and provider is ollama
  const config = getConfig();
  if (config.aiProvider === "ollama" && config.autoStartOllama) {
    // Fire-and-forget — UI will poll checkOllama on its own
    startOllamaServe().then((result) => {
      if (result.error) {
        console.log("[main] Ollama auto-start:", result.error);
      } else if (result.started) {
        console.log("[main] Ollama started automatically.");
      }
    }).catch(() => {});
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Only re-create window; IPC handlers are already registered (they're global, not per-window)
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopOllamaServe();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopOllamaServe();
});
