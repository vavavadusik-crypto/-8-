# Hermest Board — next agent handoff

## RELEASE HANDOFF (актуально)

Версия `0.2.0`. Гейт зелёный (272 unit + 5 media реальный FFmpeg + build + smoke).
Полный статус готовности и матрица 11 критериев — `docs/RELEASE_STATUS.md`.
Где мы сейчас — `docs/EXECUTION_STATE.md` (читать первым).

```bash
# установить (нужен ffmpeg в системе)
npm install

# запустить локально (127.0.0.1)
npm run dev

# проверить всё (validate · unit · smoke:api · media · build · render smoke)
npm run check

# собрать релиз + SHA-256 manifest готового билда
npm run build && npm run release:manifest   # → dist/RELEASE_MANIFEST.sha256

# деплой: Docker отдаёт статику (SPA), Vercel — api/
docker build -t hermest-board . && docker run --rm -p 8080:80 hermest-board
```

`dist/` и `dist/RELEASE_MANIFEST.sha256` — в `.gitignore` (артефакт сборки, не коммитим); manifest детерминирован и воспроизводим из идентичного `dist/`. Намеренные границы (OAuth token exchange · durable-хранилище/auth · semantic shorts) — см. `docs/RELEASE_STATUS.md`.

---

Updated: 2026-07-19 (evening, Claude Fable 5 session 5)
Owner: Вадим. Порядок работ: `docs/MASTER_PLAN_2026-07-19.md`. Где мы: `docs/EXECUTION_STATE.md` (читать ПЕРВЫМ).

## Состояние (VERIFIED 2026-07-19)

Полный стек впервые работает целиком: ElevenLabs-голос + живой Pexels b-roll
(фоновые видео по теме сцены, overlay с прозрачным Chrome-кадром) + музыкальная
подложка с auto-ducking (sidechaincompress) + композитные брендированные кадры.
Сэмплы: `~/Видео/hermest-board-ads/samples/ru-fullstack-{aterna,george}.mp4`.
Гейт: 189/189 unit + 4/4 media (включая repeat-детерминизм и ducking-замер) +
build + browser smoke. Всё запушено в `main`.

## Ключи (НИКОГДА не печатать значения)

`~/.secrets/env.sh` (вне git, проверено):
- `HERMEST_PEXELS_API_KEY` — VERIFIED 200 (бесплатный, b-roll работает)
- `HERMEST_FAL_API_KEY` — auth валиден, но аккаунт fal.ai ЗАБЛОКИРОВАН (403 Exhausted balance — пополнить fal.ai/dashboard/billing); адаптер и интеграция фонов УЖЕ РЕАЛИЗОВАНЫ (src/media/image-source.js, render-project), live-smoke ждёт баланса
- `HERMEST_ELEVENLABS_API_KEY` — VERIFIED, расход ~1000/10000 симв/мес

ElevenLabs voice IDs: George `JBFqnCBsd6RMkjVDRZzb` · Alice `Xb7hH8MSUJpSbSDYk0k2` ·
Aterna (кастомный голос Вадима) `UX4FA7ZvSPh1ma6rI8P9`.
Piper ОТВЕРГНУТ Вадимом как релизный голос — остаётся free/offline-тиром.

## Активная задача: P2.2 ЗАВЕРШЁН КОДОМ (см. docs/EXECUTION_STATE.md — там актуальный NEXT ACTION; план ниже ИСПОЛНЕН, оставлен для истории)

TDD-план: (1) `src/media/image-source.js` по образцу `src/media/broll-source.js`
(mock-TDD, describe*Availability + create*Adapter, fail-closed, санитизация,
таймауты, sha256+license+provenance в возврате); (2) style-пресет проекта (B3):
общий style-prompt добавляется к prompt каждой сцены; (3) размеры под 16:9/9:16;
(4) интеграция в render-project по образцу broll-ветки + provenance в manifest
(поле по образцу `footage`); (5) кэш ассетов (P2.3): key = hash(prompt+params+model);
(6) live-smoke 1 картинка FLUX schnell (бюджет ок — Вадим сам дал ключ на тесты).

## Требование Вадима от 2026-07-19 (кандидат в план, обсудить приоритет)

«Чтобы люди могли сами вставить свой API-ключ в UI и всё работало, и выбор
локально/облако». Сейчас: BYOK-vault есть только на API-стороне
(`api/connectors/`, `api/user-config/`), а ЛОКАЛЬНЫЙ render-worker читает ключи
только из env — моста UI→worker нет. Предложение: задача «BYOK-UX для локального
worker» (панель ключей в UI: Pexels/ElevenLabs/FAL со статусом работает/нет,
хранение через существующий encrypted-vault-код, worker подхватывает без
рестарта). Не начинать молча — согласовать с Вадимом место в плане (P2.x или P3).

## Грабли этой сессии (не наступать повторно)

1. ffmpeg 8 threaded-скедулер: `sidechaincompress`/`loudnorm` в multi-input
   `-filter_complex` недетерминированы (±1 LSB хвост, разные хеши). Фикс:
   `asetnsamples=n=1024:p=0` на входах фильтров (уже в builder). Диагностика:
   PCM `-f s16le` + `cmp -l`; проверять 3–4 прогонами, 1–2 могут «повезти».
2. Схемы манифеста fail-closed: новый argv-флаг в builder ОБЯЗАН сразу попадать
   в валидатор (`validateSceneFrameArgv` не знал `--default-background-color` —
   упало только при живом ключе, спало без него). Всегда unit-тест на новый флаг.
3. lavfi `sine` генерирует ~-18 dBFS (амплитуда 1/8) — тестовые аудио-фикстуры
   усиливать volume, иначе замеры уровней врут.
4. `npm run check` гонять БЕЗ ключей в env (свежий шелл) — иначе media-тесты
   пойдут в сеть и сломают детерминизм.
5. Сэмплы Вадиму рендерить ТОЛЬКО с ElevenLabs-голосом (см. voice IDs выше).

## Протокол

Отчёт по 8.4, непрерывность по 8.6 мастер-плана: маленькие коммиты после каждого
зелёного узкого теста, push после каждой задачи, EXECUTION_STATE обновлять в
начале задачи и после каждого коммита. Никогда: reset --hard / clean / force-push.
