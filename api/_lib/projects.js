import { createId } from "./storage.js";

const MAX_CARDS = 250;
const MAX_TEXT = 50000;
const MAX_IMAGE = 900000;

export function normalizeProjectDocument(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const now = new Date().toISOString();
  return {
    id: safeId(source.id) || "",
    schemaVersion: Number(source.schemaVersion || 1),
    title: text(source.title || "Hermest Board", 180),
    view: object(source.view, { x: 0, y: 0, zoom: 1 }),
    plan: text(source.plan, MAX_TEXT),
    roadmap: text(source.roadmap, MAX_TEXT),
    script: text(source.script, MAX_TEXT),
    publish: object(source.publish, {}),
    links: normalizeLinks(source.links),
    cards: normalizeCards(source.cards),
    createdAt: source.createdAt || now,
    updatedAt: now
  };
}

export function createProjectRecord(body = {}) {
  const project = normalizeProjectDocument(body.project || body);
  const now = new Date().toISOString();
  const id = safeId(project.id) || createId("prj");
  project.id = id;
  project.createdAt = now;
  project.updatedAt = now;
  return {
    id,
    title: project.title,
    project,
    publishPack: object(body.publishPack, null),
    stats: projectStats(project),
    createdAt: now,
    updatedAt: now
  };
}

export function updateProjectRecord(existing, body = {}) {
  const next = createProjectRecord(body);
  next.id = existing.id;
  next.project.id = existing.id;
  next.createdAt = existing.createdAt || next.createdAt;
  next.project.createdAt = existing.project?.createdAt || next.project.createdAt;
  next.updatedAt = new Date().toISOString();
  next.project.updatedAt = next.updatedAt;
  return next;
}

export function summarizeProject(record) {
  return {
    id: record.id,
    title: record.title || record.project?.title || "Hermest Board",
    stats: record.stats || projectStats(record.project || {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function projectStats(project) {
  return {
    cards: Array.isArray(project.cards) ? project.cards.length : 0,
    links: Array.isArray(project.links) ? project.links.length : 0,
    platforms: Array.isArray(project.publish?.platforms) ? project.publish.platforms.length : 0,
    languages: String(project.publish?.languages || "")
      .split(",")
      .map(item => item.trim())
      .filter(Boolean).length
  };
}

function normalizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.slice(0, MAX_CARDS).map(card => ({
    id: safeId(card.id) || createId("card"),
    x: number(card.x, 0),
    y: number(card.y, 0),
    w: number(card.w, 320),
    h: number(card.h, 300),
    z: number(card.z, 1),
    rot: number(card.rot, 0),
    color: text(card.color || "#5eead4", 32),
    kicker: text(card.kicker, 80),
    title: text(card.title || "Card", 180),
    text: text(card.text, MAX_TEXT),
    tags: Array.isArray(card.tags) ? card.tags.slice(0, 32).map(tag => text(tag, 80)).filter(Boolean) : [],
    image: text(card.image, MAX_IMAGE)
  }));
}

function normalizeLinks(links) {
  if (!Array.isArray(links)) return [];
  return links
    .map(link => Array.isArray(link) ? [safeId(link[0]), safeId(link[1])] : null)
    .filter(link => link?.[0] && link?.[1]);
}

function safeId(value) {
  const id = String(value || "").trim();
  return /^[a-z0-9_-]{2,120}$/i.test(id) ? id : "";
}

function text(value, limit) {
  return String(value || "").slice(0, limit);
}

function number(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function object(value, fallback) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}
