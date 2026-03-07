# RevisionApp

A local-first Anki-style flashcard app built with Electron, React 19, and TypeScript. Uses local Ollama LLMs (or cloud APIs) for AI-powered grading, card generation, and smart study sessions.

**This entire app was vibe coded.** Built through conversational AI-assisted development -- every feature, bug fix, and architectural decision was made through natural language prompting rather than traditional manual coding.

## Features

- **AI Grading** -- submit answers and get scored by an LLM with detailed feedback
- **AI Card Generation** -- paste notes, AI generates flashcard pairs, preview with checkboxes before bulk-adding
- **Deep Review** -- during review, get enriched explanations with Wikipedia context fed through the LLM
- **Smart Sessions** -- AI-driven card prioritization biased toward new cards for knowledge assessment
- **Battery-Aware Model Switching** -- automatically switches to a lighter model when unplugged
- **Multiple AI Providers** -- Ollama (local), OpenAI, Anthropic, Google Gemini
- **Ollama Auto-Start** -- silently spawns `ollama serve` on launch with status indicator
- **Export** -- JSON or Anki `.apkg` format via native save dialog
- **Import** -- JSON or Anki `.apkg` files
- **SM-2 Spaced Repetition** -- proven scheduling algorithm for optimal retention
- **Hierarchical Decks** -- nested deck organization with `::` separator (like Anki)
- **Dark/Light Theme** -- system-aware theming

## Tech Stack

- **Electron** -- desktop shell
- **React 19** -- UI
- **TypeScript** -- type safety
- **Tailwind CSS v4** -- styling
- **Vite** -- renderer bundling
- **Bun** -- main/preload bundling
- **better-sqlite3** -- Anki .apkg export/import
- **Ollama** -- local LLM inference (default)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Bun](https://bun.sh/)
- [Ollama](https://ollama.ai/) (optional, for local AI -- the app can auto-start it)

### Install

```bash
bun install
```

### Development

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Package for Distribution

```bash
# Windows (NSIS installer)
bun run dist:win

# Linux (AppImage)
bun run dist:linux
```

## Configuration

On first launch, the app creates a config file at `{appData}/flashcard-app/config.json`. You can configure:

- **AI Provider**: Ollama (local), OpenAI, Anthropic, or Google Gemini
- **Model Selection**: Separate models for grading, generation, deep review, and battery override
- **Ollama Auto-Start**: Toggle automatic `ollama serve` on app launch
- **API Keys**: For cloud providers (stored locally, never transmitted except to the provider)

All data is stored locally -- no cloud sync, no telemetry, no accounts.

## License

MIT
