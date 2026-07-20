// AI Director: превращает тему в рендерящийся board через провайдер-нейтральную
// text-модель (браузерный GPT через мост, BYOK-модель — любую, у кого есть
// complete()). Domain-слой: никакого HTTP здесь, только контракт и валидация.

import { buildStoryboard } from "./content-pipeline.js";

const MAX_TOPIC_CHARS = 300;
const MAX_TITLE_CHARS = 160;
const MAX_CARD_TITLE_CHARS = 120;
const MAX_CARD_TEXT_CHARS = 600;
const MIN_SCENES = 2;
const MAX_SCENES = 12;
const GRID_ORIGIN = 80;
const GRID_STEP_X = 420;
const GRID_STEP_Y = 260;
const GRID_COLUMNS = 3;

export function buildDirectorPrompt({ topic, language = "ru", sceneCount = 5, audience, tone }) {
  return [
    `Ты — режиссёр коротких обучающих видео. Тема: «${topic}».`,
    `Составь план видео из ровно ${sceneCount} сцен на языке "${language}".`,
    audience ? `Аудитория: ${audience}.` : "",
    tone ? `Тон: ${tone}.` : "",
    "Каждая сцена — карточка с коротким заголовком и 1–2 предложениями закадрового текста.",
    "Первая карточка — цепляющий вход в тему, последняя — вывод или призыв.",
    "Ответь ТОЛЬКО валидным JSON без пояснений, строго такой формы:",
    `{"title": "название видео", "cards": [{"title": "заголовок сцены", "text": "закадровый текст"}]}`
  ].filter(Boolean).join("\n");
}

export function extractJsonPayload(text) {
  const raw = String(text ?? "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function draftBoardFromTopic({
  topic,
  language = "ru",
  audience,
  tone,
  sceneCount = 5,
  voice = "",
  narrationProvider = "",
  textModel,
  maxAttempts = 2,
  signal
}) {
  const cleanTopic = String(topic ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TOPIC_CHARS);
  if (!cleanTopic) throw new RangeError("Draft topic is required");
  if (!textModel || typeof textModel.complete !== "function") {
    throw new TypeError("draftBoardFromTopic requires a text model with complete()");
  }
  const scenes = Math.min(Math.max(Number(sceneCount) || 5, MIN_SCENES), MAX_SCENES);
  const basePrompt = buildDirectorPrompt({ topic: cleanTopic, language, sceneCount: scenes, audience, tone });

  let lastFailure = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const prompt = attempt === 1
      ? basePrompt
      : `${basePrompt}\n\nПовтор: предыдущий ответ отклонён (${lastFailure}). Верни ТОЛЬКО валидный JSON описанной формы.`;
    const reply = await textModel.complete({
      system: "Ты возвращаешь только валидный JSON по заданной схеме, без markdown и комментариев.",
      prompt,
      signal
    });
    const payload = extractJsonPayload(reply);
    if (!payload) {
      lastFailure = "ответ не является JSON-объектом";
      continue;
    }
    try {
      return assembleBoard(payload, {
        topic: cleanTopic,
        language,
        audience,
        tone,
        voice,
        narrationProvider,
        sceneCount: scenes
      });
    } catch (error) {
      lastFailure = error.message;
    }
  }
  throw new RangeError(`AI Director draft failed after ${maxAttempts} attempts: ${lastFailure}`);
}

function assembleBoard(payload, { topic, language, audience, tone, voice, narrationProvider, sceneCount }) {
  const cardsInput = Array.isArray(payload.cards) ? payload.cards : [];
  const cards = [];
  for (const [index, card] of cardsInput.entries()) {
    if (cards.length >= sceneCount) break;
    const title = cleanLine(card?.title, MAX_CARD_TITLE_CHARS);
    const text = cleanLine(card?.text, MAX_CARD_TEXT_CHARS);
    if (!title || !text) continue;
    cards.push({
      id: `scene-${String(index + 1).padStart(2, "0")}`,
      x: GRID_ORIGIN + (cards.length % GRID_COLUMNS) * GRID_STEP_X,
      y: GRID_ORIGIN + Math.floor(cards.length / GRID_COLUMNS) * GRID_STEP_Y,
      title,
      text
    });
  }
  if (cards.length === 0) throw new RangeError("модель не вернула пригодных карточек");
  const board = {
    schemaVersion: 1,
    title: cleanLine(payload.title, MAX_TITLE_CHARS) || topic,
    brief: {
      topic,
      language,
      ...(audience ? { audience } : {}),
      ...(tone ? { tone } : {}),
      voice,
      narrationProvider
    },
    cards
  };
  // Единственный критерий годности драфта — он рендерится нашим же конвейером.
  buildStoryboard(board);
  return board;
}

function cleanLine(value, maxChars) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}
