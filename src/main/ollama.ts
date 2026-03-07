// Ollama process management and status checking

import { spawn, type ChildProcess } from "child_process";
import { getConfig, getAvailableOllamaModels } from "./config.js";

export interface OllamaStatusResult {
  connected: boolean;
  model: string; // resolved model for status display
  error?: string;
}

let ollamaProcess: ChildProcess | null = null;
let _autoStarted = false;

// ── Status check ──────────────────────────────────────────────────────────────

export async function checkOllamaStatus(): Promise<OllamaStatusResult> {
  const config = getConfig();
  const baseUrl = config.ollamaBaseUrl;

  try {
    const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) {
      return { connected: false, model: "", error: "Ollama not responding" };
    }

    const data = (await response.json()) as { models?: { name: string }[] };
    const models = (data.models || []).map((m) => m.name);

    // Resolve the grading model to show in status
    const gradingModel = config.models.grading || models[0] || "llama3.2";
    const hasModel = models.some(
      (m) => m === gradingModel || m.startsWith(`${gradingModel}:`),
    );

    if (models.length === 0) {
      return {
        connected: true,
        model: "",
        error: "No models pulled. Run: ollama pull llama3.2",
      };
    }

    if (!hasModel && config.models.grading) {
      return {
        connected: true,
        model: gradingModel,
        error: `Model '${gradingModel}' not found. Run: ollama pull ${gradingModel}`,
      };
    }

    return { connected: true, model: gradingModel };
  } catch {
    return {
      connected: false,
      model: "",
      error: "Cannot connect to Ollama. " + (_autoStarted ? "Starting…" : "Run: ollama serve"),
    };
  }
}

// ── Auto-start ────────────────────────────────────────────────────────────────

/**
 * Attempt to start `ollama serve` in the background.
 * No-ops if already running or already spawned this session.
 */
export async function startOllamaServe(): Promise<{ started: boolean; error?: string }> {
  // Already connected — nothing to do
  const status = await checkOllamaStatus();
  if (status.connected) return { started: false };

  if (ollamaProcess && !ollamaProcess.killed) return { started: false };

  return new Promise((resolve) => {
    try {
      // Try to find ollama in common locations
      const ollamaCmd = process.platform === "win32" ? "ollama.exe" : "ollama";

      ollamaProcess = spawn(ollamaCmd, ["serve"], {
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      _autoStarted = true;

      ollamaProcess.on("error", (err) => {
        ollamaProcess = null;
        resolve({ started: false, error: `Could not start Ollama: ${err.message}` });
      });

      // Give it 2 seconds to start, then check connectivity
      setTimeout(async () => {
        const ready = await checkOllamaStatus();
        resolve({ started: ready.connected });
      }, 2000);

    } catch (err) {
      resolve({
        started: false,
        error: `Failed to spawn ollama: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });
}

export function stopOllamaServe(): void {
  if (ollamaProcess && !ollamaProcess.killed) {
    ollamaProcess.kill("SIGTERM");
    ollamaProcess = null;
  }
}

// ── Available models ──────────────────────────────────────────────────────────

export async function listAvailableModels(): Promise<string[]> {
  const config = getConfig();
  return getAvailableOllamaModels(config.ollamaBaseUrl);
}
