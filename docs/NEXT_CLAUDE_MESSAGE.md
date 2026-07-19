# Сообщение следующему Claude Fable 5 Ultracode

> Живой файл-эстафета. Каждый агент ПЕРЕПИСЫВАЕТ его под конец своих лимитов
> (протокол — MASTER_PLAN §8.6 п.7) и обновляет копию на Рабочем столе:
> `~/Рабочий стол/HERMEST_BOARD_СООБЩЕНИЕ_СЛЕДУЮЩЕМУ_КЛОДУ.md`.
> Вадим шлёт это сообщение первым промптом новой сессии.

---

Ты — Claude Fable 5 (ультракод) и продолжаешь **Hermest Board** — SaaS
«тема → research → сценарий → голос → видео → публикация». Цель Вадима —
довести до первых денег. Работа передаётся эстафетой между сессиями.

## Первые команды (строго по порядку)

```bash
cd /home/architect/ai-dev-station/workspace/hermest-board
cat docs/EXECUTION_STATE.md      # ГДЕ МЫ — единственный источник правды
git log -5 --oneline
git status --short               # грязное дерево = обрыв посреди записи, см. §8.6 п.5
```

## Правила сессии (нарушение = потеря доверия Вадима)

1. **Свои токены — только на код.** НИКАКИХ Claude-субагентов, Agent tool,
   Workflow — Вадим запретил (лимиты). Ревью и вспомогательное — бесплатными
   агентами: `opencode run --auto -m opencode/deepseek-v4-flash-free "…"`
   (проверены deepseek-v4-flash-free и nemotron-3-ultra-free; вывод в файл, фоном).
2. **Ключи: ТОЛЬКО `. ~/.secrets/env.sh`** (source). Значения в одинарных
   кавычках — `cut`/`tr -d '"'` отдаёт ключ С КАВЫЧКАМИ → ложный 401.
   Имена: `HERMEST_ELEVENLABS_API_KEY` (жив), `HERMEST_PEXELS_API_KEY` (жив),
   `HERMEST_FAL_API_KEY` (валиден, но **баланс исчерпан → 403**; ждёт Вадима).
3. **Git:** маленькие коммиты после каждого зелёного теста; `git push origin
   main` после каждой задачи (обязателен, standing-одобрение); force-push
   запрещён; никакого reset --hard/clean в каноне.
4. **TDD + гейт:** RED→GREEN; `npm run check` перед закрытием задачи
   (сейчас зелёный: 213 unit + 5 media + build + browser smoke).
5. **После каждого коммита** — обнови `docs/EXECUTION_STATE.md`.
6. **Под конец лимитов (<20%)** — перепиши ЭТОТ файл + Desktop-копию,
   закоммить, запушь (§8.6 п.7).

## Состояние (2026-07-20, шестая сессия)

- **P2 ЗАКРЫТА КОДОМ ЦЕЛИКОМ** (P2.1–P2.10): FLUX-фоны + style-пресет,
  кэш ассетов (повторный рендер = 0 генераций), Ken Burns-дрейф статичных
  фонов (4 zoompan-пресета, детерминизм доказан), музыка с auto-ducking,
  Pexels b-roll, BYOK-панель ключей в UI (память worker, без утечек).
- Активная задача — **P3.1** (production brief + AI Director вопросы),
  см. NEXT ACTION в EXECUTION_STATE.
- Гейт фазы P2 ждёт ТОЛЬКО Вадима: прослушать голоса/музыку, посмотреть
  визуал, пополнить fal.ai (~$5) для live-smoke FLUX.

## Карта (читать по мере надобности, не всё сразу)

- `docs/EXECUTION_STATE.md` — где мы + NEXT ACTION (читать ПЕРВЫМ).
- `docs/MASTER_PLAN_2026-07-19.md` — фазы P0–P7, §8 протоколы.
- `docs/adr/ADR-001..003` — решения: TTS, image-провайдеры, b-roll.
- Медиа-код: `src/media/*` (piper/elevenlabs TTS, scene-markup/frames —
  Chrome-компоузер, broll-source — Pexels, image-source — FAL + asset-cache,
  music-bed, ffmpeg-args + manifest = schema-locked argv).
- BYOK: `src/local-media/provider-keys.js` + роуты в vite-plugin.
- Сэмплы Вадиму: `~/Видео/hermest-board-voice-samples/`.

## Контекст качества и грабли

- Piper-голоса Вадим забраковал («отстой») — релизный голос ТОЛЬКО ElevenLabs
  (George `JBFqnCBsd6RMkjVDRZzb`, Alice `Xb7hH8MSUJpSbSDYk0k2`, Aterna
  `UX4FA7ZvSPh1ma6rI8P9` — его кастомный). Видео — как референс
  `~/Загрузки/hermest-board-dmitry-v2-premium-1080p.mp4` + живые видеофоны.
- ГРАБЛЯ ffmpeg: loudnorm на чистой цифровой тишине (anullsrc) → −∞ LUFS →
  NaN → падение AAC-энкодера. Синтетика в тестах — только тихий sine.
- ГРАБЛЯ ffmpeg: флаг `-n` не перезаписывает существующий выход — огрызок
  упавшего прогона выглядит как «успех» следующего. Чисти выход перед ретраем.
- fps=24-рецепт потребует guard-тест на дрейф таймлайна (~276мс на 16 сцен).
