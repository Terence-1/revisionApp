// Unified AI client — routes to Ollama, OpenAI, Anthropic, or Gemini
// based on the persisted AppConfig and current power state.

import { getConfig } from "./config.js";
import type { AppConfig } from "./config.js";

export type AITask = "grading" | "generation" | "deepReview" | "prioritization";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  text: string;
}

// ── Model resolution ──────────────────────────────────────────────────────────

/**
 * Resolve which model name to use for a given task + power state.
 * Battery override: if onBattery and battery model is configured, use it for all tasks.
 * If a slot is empty, fall back through the chain: task-specific → grading → first available.
 */
export function resolveModel(
  config: AppConfig,
  task: AITask,
  onBattery: boolean,
  availableModels: string[] = [],
): string {
  if (config.aiProvider !== "ollama") {
    // API providers: battery = "grading" model, AC = "full" model
    const provider = config.aiProvider;
    if (provider === "openai") {
      return onBattery || task === "grading"
        ? config.openaiGradingModel
        : config.openaiFullModel;
    }
    if (provider === "anthropic") {
      return onBattery || task === "grading"
        ? config.anthropicGradingModel
        : config.anthropicFullModel;
    }
    if (provider === "gemini") {
      return onBattery || task === "grading"
        ? config.geminiGradingModel
        : config.geminiFullModel;
    }
  }

  // Ollama: battery override first
  if (onBattery && config.models.battery) return config.models.battery;

  // Task-specific model (prioritization shares grading model)
  const modelKey = task === "prioritization" ? "grading" : task;
  const taskModel = config.models[modelKey];
  if (taskModel) return taskModel;

  // Fall back to grading model
  if (config.models.grading) return config.models.grading;

  // Last resort: first available pulled model
  if (availableModels.length > 0) return availableModels[0]!;

  return "llama3.2"; // absolute last resort
}

// ── Token limits per task ─────────────────────────────────────────────────────

const OLLAMA_NUM_PREDICT: Record<AITask, number> = {
  grading: 256,
  generation: 4096,
  deepReview: 2048,
  prioritization: 2048,
};

const CLOUD_MAX_TOKENS: Record<AITask, number> = {
  grading: 512,
  generation: 4096,
  deepReview: 2048,
  prioritization: 2048,
};

// ── Core chat function ────────────────────────────────────────────────────────

export async function chat(
  messages: ChatMessage[],
  task: AITask,
  onBattery: boolean,
  availableModels: string[] = [],
): Promise<AIResponse> {
  const config = getConfig();
  const model = resolveModel(config, task, onBattery, availableModels);

  switch (config.aiProvider) {
    case "openai":
      return chatOpenAI(messages, model, config.openaiApiKey, CLOUD_MAX_TOKENS[task]);
    case "anthropic":
      return chatAnthropic(messages, model, config.anthropicApiKey, CLOUD_MAX_TOKENS[task]);
    case "gemini":
      return chatGemini(messages, model, config.geminiApiKey, CLOUD_MAX_TOKENS[task]);
    default:
      return chatOllama(messages, model, config.ollamaBaseUrl, OLLAMA_NUM_PREDICT[task]);
  }
}

// ── Ollama ────────────────────────────────────────────────────────────────────

async function chatOllama(
  messages: ChatMessage[],
  model: string,
  baseUrl: string,
  numPredict: number,
): Promise<AIResponse> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: 0.2, num_predict: numPredict },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    message?: { content: string };
    response?: string;
  };

  const text = data.message?.content ?? data.response ?? "";
  return { text: text.trim() };
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

async function chatOpenAI(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  maxTokens: number,
): Promise<AIResponse> {
  if (!apiKey) throw new Error("OpenAI API key not configured.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`OpenAI error: ${err.error?.message ?? response.statusText}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  return { text: data.choices[0]?.message?.content?.trim() ?? "" };
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

async function chatAnthropic(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  maxTokens: number,
): Promise<AIResponse> {
  if (!apiKey) throw new Error("Anthropic API key not configured.");

  // Anthropic separates system messages
  const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
  const userMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: userMessages,
  };
  if (systemMsg) body.system = systemMsg;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Anthropic error: ${err.error?.message ?? response.statusText}`);
  }

  const data = (await response.json()) as {
    content: { type: string; text: string }[];
  };

  const text = data.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();

  return { text };
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function chatGemini(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  maxTokens: number,
): Promise<AIResponse> {
  if (!apiKey) throw new Error("Gemini API key not configured.");

  // Convert to Gemini content format
  const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
  const userMessages = messages.filter((m) => m.role !== "system");

  const contents = userMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
  };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg }] };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Gemini error: ${err.error?.message ?? response.statusText}`);
  }

  const data = (await response.json()) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };

  const text =
    data.candidates[0]?.content?.parts?.map((p) => p.text).join("").trim() ?? "";

  return { text };
}

// ── Grading helper ────────────────────────────────────────────────────────────

export async function gradeAnswer(
  front: string,
  correctAnswer: string,
  userAnswer: string,
  onBattery: boolean,
  availableModels: string[] = [],
): Promise<{ score: number; feedback: string }> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a flashcard grading assistant. You MUST respond with ONLY valid JSON — no prose, no markdown fences.",
    },
    {
      role: "user",
      content: `Grade the user's answer against the correct answer.

Question: ${front}
Correct Answer: ${correctAnswer}
User's Answer: ${userAnswer}

Score 0–4:
0 = Completely wrong or blank
1 = Mostly wrong, tiny relevant info
2 = Partially correct, missing key details
3 = Correct with minor issues
4 = Perfect or essentially perfect

Respond with ONLY this JSON: {"score": <0-4>, "feedback": "<1-2 sentences>"}`,
    },
  ];

  try {
    const { text } = await chat(messages, "grading", onBattery, availableModels);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallbackGrade(correctAnswer, userAnswer);
    const parsed = JSON.parse(match[0]) as { score: number; feedback: string };
    return {
      score: Math.max(0, Math.min(4, Math.round(parsed.score))),
      feedback: parsed.feedback || "No feedback provided.",
    };
  } catch {
    return fallbackGrade(correctAnswer, userAnswer);
  }
}

// ── Card generation helper ────────────────────────────────────────────────────

export interface GeneratedCard {
  front: string;
  back: string;
}

export async function generateCards(
  notes: string,
  count: number,
  onBattery: boolean,
  availableModels: string[] = [],
): Promise<GeneratedCard[]> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a flashcard creation assistant. You MUST respond with ONLY a valid JSON array — no prose, no markdown fences.",
    },
    {
      role: "user",
      content: `Create exactly ${count} flashcard pairs from the notes below. Each card should test one specific fact, concept, or definition. Front = concise question or prompt. Back = clear, accurate answer.

Notes:
${notes}

Respond with ONLY this JSON array:
[{"front": "...", "back": "..."}, ...]`,
    },
  ];

  const { text } = await chat(messages, "generation", onBattery, availableModels);

  // Extract JSON array from response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("AI did not return a valid card array.");

  const parsed = JSON.parse(match[0]) as unknown[];
  const cards: GeneratedCard[] = [];

  for (const item of parsed) {
    if (
      item &&
      typeof item === "object" &&
      "front" in item &&
      "back" in item &&
      typeof (item as GeneratedCard).front === "string" &&
      typeof (item as GeneratedCard).back === "string" &&
      (item as GeneratedCard).front.trim() &&
      (item as GeneratedCard).back.trim()
    ) {
      cards.push({
        front: (item as GeneratedCard).front.trim(),
        back: (item as GeneratedCard).back.trim(),
      });
    }
  }

  return cards;
}

// ── Deep review helper ────────────────────────────────────────────────────────

export interface DeepReviewResult {
  explanation: string;
  sources: { title: string; url: string; summary: string }[];
}

export async function deepReview(
  front: string,
  back: string,
  userAnswer: string,
  onBattery: boolean,
  availableModels: string[] = [],
): Promise<DeepReviewResult> {
  // Step 1: search Wikipedia for context
  const searchTerms = extractSearchTerms(front, back);
  const wikiResults = await searchWikipedia(searchTerms);

  // Step 2: build context string from Wikipedia results
  const contextBlock =
    wikiResults.length > 0
      ? wikiResults
          .map((r) => `[${r.title}]: ${r.summary}`)
          .join("\n\n")
      : "No additional context found.";

  // Step 3: ask the AI for an enriched explanation
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an expert tutor helping a student deeply understand a flashcard topic. Use the provided context to give a thorough explanation.",
    },
    {
      role: "user",
      content: `A student is studying this flashcard:

Question: ${front}
Correct Answer: ${back}
Student's Answer: ${userAnswer}

Wikipedia context:
${contextBlock}

Provide a thorough explanation of the topic, correct any misconceptions in the student's answer, and highlight what's most important to remember. Be educational and clear. Aim for 3-5 paragraphs.`,
    },
  ];

  const { text } = await chat(messages, "deepReview", onBattery, availableModels);

  return {
    explanation: text,
    sources: wikiResults.map((r) => ({
      title: r.title,
      url: r.url,
      summary: r.summary.slice(0, 200) + (r.summary.length > 200 ? "…" : ""),
    })),
  };
}

// ── Wikipedia search ──────────────────────────────────────────────────────────

interface WikiResult {
  title: string;
  summary: string;
  url: string;
}

function extractSearchTerms(front: string, back: string): string {
  // Use first ~80 chars of front as search query
  const combined = `${front} ${back}`;
  return combined.replace(/[^a-zA-Z0-9\s]/g, " ").trim().slice(0, 120);
}

async function searchWikipedia(query: string): Promise<WikiResult[]> {
  try {
    // Step 1: search for page titles
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return [];

    const searchData = (await searchRes.json()) as {
      query?: { search?: { title: string; pageid: number }[] };
    };
    const hits = searchData.query?.search?.slice(0, 3) ?? [];
    if (hits.length === 0) return [];

    // Step 2: fetch summaries for each hit in parallel
    const results = await Promise.all(
      hits.map(async (hit): Promise<WikiResult | null> => {
        try {
          const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`;
          const sumRes = await fetch(summaryUrl);
          if (!sumRes.ok) return null;
          const sumData = (await sumRes.json()) as {
            title: string;
            extract: string;
            content_urls?: { desktop?: { page?: string } };
          };
          return {
            title: sumData.title,
            summary: sumData.extract?.slice(0, 500) ?? "",
            url: sumData.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title)}`,
          };
        } catch {
          return null;
        }
      }),
    );

    return results.filter((r): r is WikiResult => r !== null && r.summary.length > 0);
  } catch {
    return [];
  }
}

// ── Fallback grader (no AI) ───────────────────────────────────────────────────

function fallbackGrade(
  correctAnswer: string,
  userAnswer: string,
): { score: number; feedback: string } {
  const correct = correctAnswer.toLowerCase().trim();
  const user = userAnswer.toLowerCase().trim();

  if (!user) return { score: 0, feedback: "No answer provided. (AI unavailable — using basic matching)" };
  if (correct === user) return { score: 4, feedback: "Exact match! (AI unavailable — using basic matching)" };
  if (correct.includes(user) || user.includes(correct))
    return { score: 3, feedback: "Close match. (AI unavailable — using basic matching)" };

  const correctWords = new Set(correct.split(/\s+/));
  const userWords = new Set(user.split(/\s+/));
  let overlap = 0;
  for (const w of userWords) if (correctWords.has(w)) overlap++;
  const ratio = correctWords.size > 0 ? overlap / correctWords.size : 0;

  if (ratio >= 0.7) return { score: 3, feedback: "Most key words present. (AI unavailable — using basic matching)" };
  if (ratio >= 0.4) return { score: 2, feedback: "Some overlap. (AI unavailable — using basic matching)" };
  if (ratio > 0) return { score: 1, feedback: "Very little overlap. (AI unavailable — using basic matching)" };
  return { score: 0, feedback: "No match found. (AI unavailable — using basic matching)" };
}

// ── Hint generation helper ────────────────────────────────────────────────────

export interface HintResult {
  hint: string;
}

/**
 * Generate a helpful hint for a flashcard without revealing the full answer.
 * The hint should nudge the student in the right direction.
 */
export async function generateHint(
  front: string,
  back: string,
  onBattery: boolean,
  availableModels: string[] = [],
): Promise<HintResult> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a flashcard study assistant. You help students recall answers by giving short, helpful hints. You MUST respond with ONLY valid JSON — no prose, no markdown fences.",
    },
    {
      role: "user",
      content: `A student is trying to answer this flashcard but needs a hint.

Question: ${front}
Correct Answer: ${back}

Give a brief hint that helps them recall the answer WITHOUT revealing it directly. The hint should:
- Give a clue, mnemonic, first letter, category, or related concept
- Be 1-2 sentences maximum
- NOT contain the exact answer or most of the answer

Respond with ONLY this JSON: {"hint": "<your hint>"}`,
    },
  ];

  try {
    const { text } = await chat(messages, "grading", onBattery, availableModels);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { hint: `Think about the first letter: "${back.trim()[0]?.toUpperCase() ?? "?"}"...` };
    const parsed = JSON.parse(match[0]) as { hint: string };
    return { hint: parsed.hint || "No hint available." };
  } catch {
    // Fallback: simple first-letter hint
    const firstChar = back.trim()[0]?.toUpperCase() ?? "?";
    const wordCount = back.trim().split(/\s+/).length;
    return {
      hint: `The answer starts with "${firstChar}" and is ${wordCount} word${wordCount === 1 ? "" : "s"} long.`,
    };
  }
}

// ── Card prioritization ───────────────────────────────────────────────────────

export interface CardMeta {
  id: string;
  deckId: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  dueDate: string;
  lastReview: string | null;
}

/**
 * Ask the AI to rank cards by study priority.
 * Returns an ordered array of card IDs (highest priority first).
 * Falls back to the input order if the AI fails or returns invalid data.
 */
export async function prioritizeCards(
  cards: CardMeta[],
  totalCount: number,
  onBattery: boolean,
  availableModels: string[] = [],
): Promise<string[]> {
  if (cards.length === 0) return [];
  // Not worth an AI call for very small sets
  if (cards.length <= 3) return cards.map((c) => c.id);

  const today = new Date().toISOString().split("T")[0]!;

  // Build compact metadata for the prompt
  const cardData = cards.map((c) => ({
    id: c.id,
    ef: Math.round(c.easeFactor * 100) / 100,
    ivl: c.interval,
    reps: c.repetitions,
    due: c.dueDate,
    last: c.lastReview,
  }));

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a spaced repetition scheduling assistant. You MUST respond with ONLY a valid JSON array of card ID strings — no prose, no markdown fences, no explanation.",
    },
    {
      role: "user",
      content: `Today is ${today}. The user wants to study ${totalCount} cards. Given these flashcard review histories, return exactly ${totalCount} card IDs in optimal study order.

Prioritization guidelines:
- BIAS HEAVILY TOWARD NEW CARDS (reps=0). New cards are the highest priority because they let us assess the user's knowledge gaps. Roughly 40-60% of the selected cards should be new (if enough new cards exist).
- Interleave new cards throughout the ranking — don't cluster them all at the top or bottom. Spread them evenly among review cards for variety.
- Among review cards: struggling cards (low ef < 2.0, reps > 0) need urgent review, then overdue cards, then cards due today.
- Cards overdue by many days relative to their interval need attention after new cards.

Cards (ef=easeFactor, ivl=interval days, reps=repetitions, due=dueDate, last=lastReview):
${JSON.stringify(cardData)}

Respond with ONLY a JSON array of exactly ${totalCount} id strings in study order, e.g. ["id1","id2","id3"]`,
    },
  ];

  try {
    const { text } = await chat(messages, "prioritization", onBattery, availableModels);
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return cards.map((c) => c.id);

    const parsed = JSON.parse(match[0]) as unknown[];
    const ids = parsed.filter((x): x is string => typeof x === "string");

    // Validate: all returned IDs must be from our input set
    const validIds = new Set(cards.map((c) => c.id));
    const result = ids.filter((id) => validIds.has(id));

    // If AI missed some cards, append them at the end
    if (result.length < cards.length) {
      const returned = new Set(result);
      for (const c of cards) {
        if (!returned.has(c.id)) result.push(c.id);
      }
    }

    return result;
  } catch {
    // Silent fallback — return input order
    return cards.map((c) => c.id);
  }
}
