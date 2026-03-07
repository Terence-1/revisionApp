import { useState, useRef } from "react";
import { useTheme, type ThemePreference } from "../hooks/useTheme.js";
import { useConfig } from "../hooks/useConfig.js";
import type { AIProvider } from "../types/index.js";

const themeOptions: { value: ThemePreference; label: string; description: string }[] = [
  { value: "system", label: "System", description: "Follow your operating system preference" },
  { value: "light", label: "Light", description: "Always use light theme" },
  { value: "dark", label: "Dark", description: "Always use dark theme" },
];

const providers: { value: AIProvider; label: string; description: string }[] = [
  { value: "ollama", label: "Ollama (local)", description: "Run models locally — no API key required" },
  { value: "openai", label: "OpenAI", description: "GPT-4o and GPT-4o-mini via OpenAI API" },
  { value: "anthropic", label: "Anthropic", description: "Claude models via Anthropic API" },
  { value: "gemini", label: "Google Gemini", description: "Gemini models via Google AI API" },
];

// Predefined model lists for each cloud provider
const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4o"];
const ANTHROPIC_MODELS = ["claude-haiku-3-5", "claude-sonnet-4-5"];
const GEMINI_MODELS = ["gemini-1.5-flash", "gemini-1.5-pro"];

// Section header component
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-xs font-semibold uppercase tracking-wider mb-3"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </h2>
  );
}

// Card wrapper
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg overflow-hidden mb-1"
      style={{ border: "1px solid var(--border)" }}
    >
      {children}
    </div>
  );
}

// Row inside a card
function CardRow({
  children,
  topBorder = true,
}: {
  children: React.ReactNode;
  topBorder?: boolean;
}) {
  return (
    <div
      className="px-4 py-3"
      style={{
        backgroundColor: "var(--bg-card)",
        borderTop: topBorder ? "1px solid var(--border)" : "none",
      }}
    >
      {children}
    </div>
  );
}

// Label + description pair
function FieldLabel({ label, description }: { label: string; description?: string }) {
  return (
    <div className="mb-1.5">
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      {description && (
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      )}
    </div>
  );
}

// Model select dropdown (Ollama = dynamic list, cloud = predefined)
function ModelSelect({
  value,
  onChange,
  models,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  models: string[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
      style={{
        backgroundColor: "var(--bg-primary)",
        border: "1px solid var(--border)",
        color: value ? "var(--text-primary)" : "var(--text-muted)",
      }}
    >
      <option value="">{placeholder}</option>
      {models.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}

// Text input that saves only on blur (avoids IPC on every keystroke)
function DeferredInput({
  value,
  onChange,
  type = "text",
  placeholder,
  className = "",
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [local, setLocal] = useState(value);
  // Sync from parent when external value changes (e.g., config reload)
  const prev = useRef(value);
  if (prev.current !== value) {
    prev.current = value;
    if (local !== value) setLocal(value);
  }
  return (
    <input
      type={type}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onChange(local); }}
      placeholder={placeholder}
      className={className}
      style={style}
    />
  );
}

// Masked text input for API keys (saves on blur only)
function ApiKeyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  const [local, setLocal] = useState(value);
  const prev = useRef(value);
  if (prev.current !== value) {
    prev.current = value;
    if (local !== value) setLocal(value);
  }
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onChange(local); }}
        placeholder={placeholder}
        className="w-full pl-3 pr-16 py-2 rounded-lg text-sm outline-none font-mono"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer"
        style={{ background: "none", border: "none", color: "var(--text-muted)" }}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export default function Settings() {
  const { theme, preference, setPreference } = useTheme();
  const { config, loading, saving, availableModels, powerState, updateConfig, refreshModels } =
    useConfig();

  // Local Ollama start state
  const [startingOllama, setStartingOllama] = useState(false);
  const [ollamaStartMsg, setOllamaStartMsg] = useState<string | null>(null);

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-20">
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }}
        />
      </div>
    );
  }

  const isOllama = config.aiProvider === "ollama";

  const handleStartOllama = async () => {
    setStartingOllama(true);
    setOllamaStartMsg(null);
    try {
      const result = await window.api.startOllama();
      setOllamaStartMsg(result.started ? "Ollama started." : result.error ?? "Already running.");
      if (result.started) await refreshModels();
    } catch {
      setOllamaStartMsg("Failed to start Ollama.");
    }
    setStartingOllama(false);
  };

  // Helper: update a single top-level key
  const set = <K extends keyof typeof config>(key: K, value: typeof config[K]) =>
    updateConfig({ [key]: value } as Partial<typeof config>);

  // Helper: update models sub-object
  const setModel = (task: keyof typeof config.models, value: string) =>
    updateConfig({ models: { ...config.models, [task]: value } });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8" style={{ color: "var(--text-primary)" }}>
        Settings
      </h1>

      {/* ── Appearance ── */}
      <section className="mb-8">
        <SectionHeader>Appearance</SectionHeader>
        <Card>
          <div className="px-4 py-3" style={{ backgroundColor: "var(--bg-card)" }}>
            <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Theme
            </label>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Currently using {theme} mode{preference === "system" && " (auto-detected)"}
            </p>
          </div>
          {themeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setPreference(option.value)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
              style={{
                backgroundColor:
                  preference === option.value ? "var(--accent-subtle)" : "var(--bg-card)",
                border: "none",
                borderTop: "1px solid var(--border)",
              }}
            >
              <div
                className="flex-shrink-0"
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  border:
                    preference === option.value
                      ? "5px solid var(--accent)"
                      : "2px solid var(--border-hover)",
                  backgroundColor:
                    preference === option.value ? "var(--bg-card)" : "transparent",
                }}
              />
              <div>
                <span
                  className="text-sm font-medium"
                  style={{
                    color:
                      preference === option.value ? "var(--accent)" : "var(--text-primary)",
                  }}
                >
                  {option.label}
                </span>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {option.description}
                </p>
              </div>
            </button>
          ))}
        </Card>
      </section>

      {/* ── AI Provider ── */}
      <section className="mb-8">
        <SectionHeader>AI Provider</SectionHeader>
        <Card>
          <div className="px-4 py-3" style={{ backgroundColor: "var(--bg-card)" }}>
            <FieldLabel
              label="Provider"
              description="Choose where AI features (grading, generation, deep review) run"
            />
          </div>
          {providers.map((p) => (
            <button
              key={p.value}
              onClick={() => set("aiProvider", p.value)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
              style={{
                backgroundColor:
                  config.aiProvider === p.value ? "var(--accent-subtle)" : "var(--bg-card)",
                border: "none",
                borderTop: "1px solid var(--border)",
              }}
            >
              <div
                className="flex-shrink-0"
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  border:
                    config.aiProvider === p.value
                      ? "5px solid var(--accent)"
                      : "2px solid var(--border-hover)",
                  backgroundColor:
                    config.aiProvider === p.value ? "var(--bg-card)" : "transparent",
                }}
              />
              <div>
                <span
                  className="text-sm font-medium"
                  style={{
                    color:
                      config.aiProvider === p.value ? "var(--accent)" : "var(--text-primary)",
                  }}
                >
                  {p.label}
                </span>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {p.description}
                </p>
              </div>
            </button>
          ))}
        </Card>
      </section>

      {/* ── Ollama Settings (shown when Ollama selected) ── */}
      {isOllama && (
        <section className="mb-8">
          <SectionHeader>Ollama</SectionHeader>
          <Card>
            {/* Base URL */}
            <div className="px-4 py-3" style={{ backgroundColor: "var(--bg-card)" }}>
              <FieldLabel label="Base URL" description="Default: http://localhost:11434" />
              <DeferredInput
                value={config.ollamaBaseUrl}
                onChange={(v) => set("ollamaBaseUrl", v)}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            {/* Auto-start toggle */}
            <CardRow>
              <div className="flex items-center justify-between">
                <FieldLabel
                  label="Auto-start Ollama"
                  description="Launch ollama serve automatically when the app opens"
                />
                <button
                  onClick={() => set("autoStartOllama", !config.autoStartOllama)}
                  className="flex-shrink-0 ml-4 cursor-pointer"
                  style={{
                    width: "40px",
                    height: "22px",
                    borderRadius: "11px",
                    backgroundColor: config.autoStartOllama
                      ? "var(--accent)"
                      : "var(--border-hover)",
                    border: "none",
                    position: "relative",
                    transition: "background-color 0.2s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "3px",
                      left: config.autoStartOllama ? "21px" : "3px",
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      backgroundColor: "white",
                      transition: "left 0.2s",
                    }}
                  />
                </button>
              </div>
            </CardRow>

            {/* Manual start button */}
            <CardRow>
              <div className="flex items-center justify-between">
                <FieldLabel
                  label="Start Ollama manually"
                  description="Useful if auto-start is off or Ollama stopped"
                />
                <button
                  onClick={handleStartOllama}
                  disabled={startingOllama}
                  className="ml-4 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    flexShrink: 0,
                  }}
                >
                  {startingOllama ? "Starting..." : "Start Ollama"}
                </button>
              </div>
              {ollamaStartMsg && (
                <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                  {ollamaStartMsg}
                </p>
              )}
            </CardRow>

            {/* Refresh models */}
            <CardRow>
              <div className="flex items-center justify-between">
                <FieldLabel
                  label="Available models"
                  description={
                    availableModels.length > 0
                      ? `${availableModels.length} model${availableModels.length === 1 ? "" : "s"} found`
                      : "No models found — is Ollama running?"
                  }
                />
                <button
                  onClick={refreshModels}
                  className="ml-4 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                    flexShrink: 0,
                  }}
                >
                  Refresh
                </button>
              </div>
              {availableModels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {availableModels.map((m) => (
                    <span
                      key={m}
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        color: "var(--text-muted)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </CardRow>
          </Card>
        </section>
      )}

      {/* ── OpenAI Settings ── */}
      {config.aiProvider === "openai" && (
        <section className="mb-8">
          <SectionHeader>OpenAI</SectionHeader>
          <Card>
            <div className="px-4 py-3" style={{ backgroundColor: "var(--bg-card)" }}>
              <FieldLabel label="API Key" />
              <ApiKeyInput
                value={config.openaiApiKey}
                onChange={(v) => set("openaiApiKey", v)}
                placeholder="sk-..."
              />
            </div>
            <CardRow>
              <FieldLabel label="Grading / battery model" description="Fast, low-cost model" />
              <ModelSelect
                value={config.openaiGradingModel}
                onChange={(v) => set("openaiGradingModel", v)}
                models={OPENAI_MODELS}
                placeholder="Select model"
              />
            </CardRow>
            <CardRow>
              <FieldLabel label="Full model" description="Used for generation and deep review" />
              <ModelSelect
                value={config.openaiFullModel}
                onChange={(v) => set("openaiFullModel", v)}
                models={OPENAI_MODELS}
                placeholder="Select model"
              />
            </CardRow>
          </Card>
        </section>
      )}

      {/* ── Anthropic Settings ── */}
      {config.aiProvider === "anthropic" && (
        <section className="mb-8">
          <SectionHeader>Anthropic</SectionHeader>
          <Card>
            <div className="px-4 py-3" style={{ backgroundColor: "var(--bg-card)" }}>
              <FieldLabel label="API Key" />
              <ApiKeyInput
                value={config.anthropicApiKey}
                onChange={(v) => set("anthropicApiKey", v)}
                placeholder="sk-ant-..."
              />
            </div>
            <CardRow>
              <FieldLabel label="Grading / battery model" description="Fast, low-cost model" />
              <ModelSelect
                value={config.anthropicGradingModel}
                onChange={(v) => set("anthropicGradingModel", v)}
                models={ANTHROPIC_MODELS}
                placeholder="Select model"
              />
            </CardRow>
            <CardRow>
              <FieldLabel label="Full model" description="Used for generation and deep review" />
              <ModelSelect
                value={config.anthropicFullModel}
                onChange={(v) => set("anthropicFullModel", v)}
                models={ANTHROPIC_MODELS}
                placeholder="Select model"
              />
            </CardRow>
          </Card>
        </section>
      )}

      {/* ── Gemini Settings ── */}
      {config.aiProvider === "gemini" && (
        <section className="mb-8">
          <SectionHeader>Google Gemini</SectionHeader>
          <Card>
            <div className="px-4 py-3" style={{ backgroundColor: "var(--bg-card)" }}>
              <FieldLabel label="API Key" />
              <ApiKeyInput
                value={config.geminiApiKey}
                onChange={(v) => set("geminiApiKey", v)}
                placeholder="AIza..."
              />
            </div>
            <CardRow>
              <FieldLabel label="Grading / battery model" description="Fast, low-cost model" />
              <ModelSelect
                value={config.geminiGradingModel}
                onChange={(v) => set("geminiGradingModel", v)}
                models={GEMINI_MODELS}
                placeholder="Select model"
              />
            </CardRow>
            <CardRow>
              <FieldLabel label="Full model" description="Used for generation and deep review" />
              <ModelSelect
                value={config.geminiFullModel}
                onChange={(v) => set("geminiFullModel", v)}
                models={GEMINI_MODELS}
                placeholder="Select model"
              />
            </CardRow>
          </Card>
        </section>
      )}

      {/* ── Model Assignment (Ollama only — separate slots per task) ── */}
      {isOllama && (
        <section className="mb-8">
          <SectionHeader>Model Assignment</SectionHeader>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Assign different Ollama models to each task. Leave blank to use the first available
            model. If a model is missing, run{" "}
            <code
              className="px-1 py-0.5 rounded text-xs"
              style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)" }}
            >
              ollama pull &lt;model&gt;
            </code>{" "}
            in your terminal.
          </p>
          <Card>
            <div className="px-4 py-3" style={{ backgroundColor: "var(--bg-card)" }}>
              <FieldLabel label="Grading model" description="Evaluates your answers during review" />
              <ModelSelect
                value={config.models.grading}
                onChange={(v) => setModel("grading", v)}
                models={availableModels}
                placeholder="— use first available —"
              />
            </div>
            <CardRow>
              <FieldLabel
                label="Generation model"
                description="Creates flashcard pairs from your notes"
              />
              <ModelSelect
                value={config.models.generation}
                onChange={(v) => setModel("generation", v)}
                models={availableModels}
                placeholder="— use first available —"
              />
            </CardRow>
            <CardRow>
              <FieldLabel
                label="Deep Review model"
                description="Produces enriched explanations with Wikipedia context"
              />
              <ModelSelect
                value={config.models.deepReview}
                onChange={(v) => setModel("deepReview", v)}
                models={availableModels}
                placeholder="— use first available —"
              />
            </CardRow>
          </Card>
        </section>
      )}

      {/* ── Battery Mode ── */}
      <section className="mb-8">
        <SectionHeader>Battery Mode</SectionHeader>
        <Card>
          {/* Power state indicator */}
          <div className="px-4 py-3" style={{ backgroundColor: "var(--bg-card)" }}>
            <div className="flex items-center gap-2">
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: powerState.onBattery ? "var(--warning)" : "var(--success)",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {powerState.onBattery ? "Running on battery" : "Plugged in (AC power)"}
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              When on battery, the battery model overrides all AI tasks to save power.
            </p>
          </div>

          {/* Battery model picker */}
          {isOllama ? (
            <CardRow>
              <FieldLabel
                label="Battery override model"
                description="Used for all tasks when unplugged. Falls back to grading model if blank."
              />
              <ModelSelect
                value={config.models.battery}
                onChange={(v) => setModel("battery", v)}
                models={availableModels}
                placeholder="— fall back to grading model —"
              />
            </CardRow>
          ) : (
            <CardRow>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                When using a cloud provider, battery mode automatically uses the provider's
                grading/fast model for all tasks while unplugged.
              </p>
            </CardRow>
          )}
        </Card>
      </section>

      {/* Saving indicator */}
      {saving && (
        <div
          className="fixed bottom-4 right-4 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div
            className="w-3 h-3 border-2 rounded-full animate-spin"
            style={{
              borderColor: "var(--border)",
              borderTopColor: "var(--accent)",
            }}
          />
          Saving...
        </div>
      )}
    </div>
  );
}
