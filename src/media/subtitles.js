export function buildSubtitleCues(storyboard) {
  const scenes = Array.isArray(storyboard?.scenes) ? storyboard.scenes : [];
  let cursorMs = 0;
  return scenes.map((scene, index) => {
    const durationMs = Number(scene?.durationMs);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new TypeError(`Scene ${scene?.id || index + 1} requires a positive duration`);
    }
    const cue = {
      index: index + 1,
      sceneId: String(scene?.id || `scene-${index + 1}`),
      startMs: cursorMs,
      endMs: cursorMs + Math.round(durationMs),
      text: cleanText(scene?.narration)
    };
    cursorMs = cue.endMs;
    return cue;
  });
}

export function formatSrt(cues) {
  const blocks = cues.map(cue => [
    cue.index,
    `${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}`,
    cleanText(cue.text)
  ].join("\n"));
  return blocks.length ? `${blocks.join("\n\n")}\n` : "";
}

function formatTimestamp(value) {
  const milliseconds = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const remainder = milliseconds % 1000;
  return [hours, minutes, seconds].map(part => String(part).padStart(2, "0")).join(":") +
    `,${String(remainder).padStart(3, "0")}`;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
}
