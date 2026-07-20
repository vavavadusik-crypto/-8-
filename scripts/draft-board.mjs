// Одна кнопка «тема → борд»: браузерный GPT (через browser-ai-bridge) пишет
// план видео, мы собираем валидный board JSON, готовый для renderProject.
//
//   node scripts/draft-board.mjs "Квантовые компьютеры простыми словами" [файл.json]
//   env: HERMEST_BRIDGE_URL, HERMEST_BRIDGE_MODEL, HERMEST_DRAFT_SCENES,
//        HERMEST_DRAFT_LANGUAGE, HERMEST_DRAFT_VOICE, HERMEST_DRAFT_TTS,
//        HERMEST_DRAFT_RESEARCH=off — пропустить research-этап

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { draftBoardFromTopic } from "../src/domain/ai-director.js";
import { searchResearchSources } from "../src/media/research-sources.js";
import { createBridgeTextModel, describeBridgeAvailability } from "../src/media/text-model.js";

const topic = process.argv[2];
if (!topic) {
  console.error('usage: node scripts/draft-board.mjs "<тема>" [выходной-файл.json]');
  process.exit(1);
}
const outputPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve(`draft-board-${Date.now()}.json`);

const availability = await describeBridgeAvailability();
if (availability.status !== "executable") {
  console.error(`BLOCKED: ${availability.reason}`);
  process.exit(2);
}

let sources = [];
if (process.env.HERMEST_DRAFT_RESEARCH !== "off") {
  const research = await searchResearchSources(topic);
  sources = research.sources;
  for (const warning of research.warnings) console.error(`research warning: ${warning}`);
  console.log(`research: ${sources.length} источников`);
}

const board = await draftBoardFromTopic({
  topic,
  language: process.env.HERMEST_DRAFT_LANGUAGE || "ru",
  sceneCount: Number(process.env.HERMEST_DRAFT_SCENES) || 6,
  voice: process.env.HERMEST_DRAFT_VOICE || "",
  narrationProvider: process.env.HERMEST_DRAFT_TTS || "",
  textModel: createBridgeTextModel(),
  sources
});

await writeFile(outputPath, `${JSON.stringify(board, null, 2)}\n`, { flag: "wx" });
console.log(`board: ${outputPath}`);
console.log(`title: ${board.title}`);
console.log(`cards: ${board.cards.map(card => card.title).join(" · ")}`);
const citedCards = board.cards.filter(card => Array.isArray(card.sourceRefs) && card.sourceRefs.length > 0).length;
if (sources.length) console.log(`citations: ${citedCards}/${board.cards.length} карточек с источниками`);
