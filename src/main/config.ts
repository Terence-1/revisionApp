// App configuration — persisted to appData/flashcard-app/config.json

import fs from "fs";
import path from "path";

export type AIProvider = "ollama" | "openai" | "anthropic" | "gemini";

export interface ModelConfig {
  grading: string;
  generation: string;
  deepReview: string;
  battery: string; // override for all tasks when on battery; falls back to grading if empty
}

export interface AppConfig {
  aiProvider: AIProvider;
  ollamaBaseUrl: string;
  autoStartOllama: boolean;
  models: ModelConfig;
  openaiApiKey: string;
  openaiGradingModel: string;
  openaiFullModel: string;
  anthropicApiKey: string;
  anthropicGradingModel: string;
  anthropicFullModel: string;
  geminiApiKey: string;
  geminiGradingModel: string;
  geminiFullModel: string;
}

const DEFAULT_CONFIG: AppConfig = {
  aiProvider: "ollama",
  ollamaBaseUrl: "http://localhost:11434",
  autoStartOllama: true,
  models: {
    grading: "",
    generation: "",
    deepReview: "",
    battery: "",
  },
  openaiApiKey: "",
  openaiGradingModel: "gpt-4o-mini",
  openaiFullModel: "gpt-4o",
  anthropicApiKey: "",
  anthropicGradingModel: "claude-haiku-3-5",
  anthropicFullModel: "claude-sonnet-4-5",
  geminiApiKey: "",
  geminiGradingModel: "gemini-1.5-flash",
  geminiFullModel: "gemini-1.5-pro",
};

let configPath: string;
let _config: AppConfig = { ...DEFAULT_CONFIG };

export function initConfig(appDataPath: string): void {
  const dir = path.join(appDataPath, "flashcard-app");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  configPath = path.join(dir, "config.json");

  if (fs.existsSync(configPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Partial<AppConfig>;
      _config = deepMerge(DEFAULT_CONFIG, raw);
    } catch {
      _config = { ...DEFAULT_CONFIG };
    }
  } else {
    _config = { ...DEFAULT_CONFIG };
    saveConfig();
  }
}

function saveConfig(): void {
  if (!configPath) return;
  fs.writeFileSync(configPath, JSON.stringify(_config, null, 2));
}

export function getConfig(): AppConfig {
  return { ..._config, models: { ..._config.models } };
}

export function setConfig(partial: Partial<AppConfig>): AppConfig {
  _config = deepMerge(_config, partial) as AppConfig;
  saveConfig();
  return getConfig();
}

/** Query Ollama for pulled models */
export async function getAvailableOllamaModels(baseUrl?: string): Promise<string[]> {
  const url = baseUrl || _config.ollamaBaseUrl;
  try {
    const res = await fetch(`${url}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models || []).map((m) => m.name).sort();
  } catch {
    return [];
  }
}

// ── Helpers ──

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const ov = override[key];
    const bv = base[key];
    if (
      ov !== null &&
      typeof ov === "object" &&
      !Array.isArray(ov) &&
      typeof bv === "object" &&
      bv !== null
    ) {
      result[key] = deepMerge(bv as object, ov as object) as T[keyof T];
    } else if (ov !== undefined) {
      result[key] = ov as T[keyof T];
    }
  }
  return result;
}
