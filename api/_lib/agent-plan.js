export function buildAgentPlan(pack = {}) {
  const platforms = Array.isArray(pack.platforms) ? pack.platforms : [];
  const tools = Array.isArray(pack.tools) ? pack.tools : [];
  const languages = Array.isArray(pack.languages) ? pack.languages : [];
  const connectors = connectorStatus();
  const steps = [
    step("parse_board", tools.includes("parser"), "Разобрать карточки, план, roadmap и research query."),
    step("research_sources", tools.includes("parser"), "Собрать публичные источники через research API и сохранить ссылки."),
    step("rights_check", tools.includes("rights_check"), "Проверить лицензии и права на внешние материалы."),
    step("translate", tools.includes("translator") && languages.length > 0, "Подготовить локализации сценария, описаний, хэштегов и субтитров."),
    step("prepare_media", tools.includes("web_media") || tools.includes("generated_media"), "Подобрать или сгенерировать b-roll, обложки, вертикальные и горизонтальные ассеты."),
    step("render_versions", true, "Собрать 9:16 версии для Shorts/Reels/TikTok и 16:9 версию для YouTube."),
    step("approval_gate", true, "Показать человеку финальный пакет перед публикацией."),
    step("publish_drafts", platformsReady(platforms, connectors), "Создать черновики или публикации на подключённых площадках."),
    step("audit_report", true, "Сохранить ссылки, ошибки, метрики и следующий action plan.")
  ];
  const blockers = [];

  if (!platforms.length) blockers.push("platforms_not_selected");
  for (const platform of platforms) {
    const provider = providerForPlatform(platform);
    if (provider && !connectors[provider]) blockers.push(`${provider}_connector_missing`);
  }
  if (!process.env.OPENAI_API_KEY && tools.includes("generated_media")) blockers.push("media_generation_provider_missing");
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL && !process.env.BLOB_READ_WRITE_TOKEN) blockers.push("durable_storage_missing");

  return {
    ok: true,
    status: blockers.length ? "blocked_until_connectors_and_storage" : "ready_for_human_approval",
    canAutopublish: false,
    blockers: [...new Set(blockers)],
    connectors,
    steps,
    note: "Autopublish remains disabled until OAuth, durable storage, token encryption, and explicit user approval are implemented."
  };
}

function step(id, ready, description) {
  return {
    id,
    status: ready ? "ready" : "blocked",
    description
  };
}

function platformsReady(platforms, connectors) {
  return platforms.length > 0 && platforms.every(platform => {
    const provider = providerForPlatform(platform);
    return provider ? connectors[provider] : false;
  });
}

function providerForPlatform(platform) {
  if (platform === "youtube_video" || platform === "youtube_shorts") return "youtube";
  if (platform === "instagram_reels") return "instagram";
  if (platform === "tiktok") return "tiktok";
  return "";
}

function connectorStatus() {
  return {
    youtube: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET),
    tiktok: Boolean(process.env.TIKTOK_CLIENT_ID && process.env.TIKTOK_CLIENT_SECRET),
    instagram: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    openai: Boolean(process.env.OPENAI_API_KEY)
  };
}
