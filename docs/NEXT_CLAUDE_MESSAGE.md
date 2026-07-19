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
   (список: `opencode models | grep free`; проверены deepseek-v4-flash-free и
   nemotron-3-ultra-free; вывод перенаправляй в файл, запускай фоном).
2. **Ключи: ТОЛЬКО `. ~/.secrets/env.sh`** (source). Значения в одинарных
   кавычках — `cut`/`tr -d '"'` отдаёт ключ С КАВЫЧКАМИ → 401 (грабля этой
   сессии). Имена: `HERMEST_ELEVENLABS_API_KEY` (жив, ~9k симв. остаток),
   `HERMEST_PEXELS_API_KEY` (жив, бесплатный), `HERMEST_FAL_API_KEY`
   (ключ валиден, но **баланс исчерпан → 403**; ждёт пополнения Вадимом).
3. **Git:** маленькие коммиты после каждого зелёного теста; `git push origin
   main` после каждой задачи (обязателен, standing-одобрение); force-push
   запрещён; никакого reset --hard/clean в каноне.
4. **TDD + гейт:** RED→GREEN; `npm run check` перед закрытием задачи
   (сейчас зелёный: 198 unit + 4 media + build + browser smoke).
5. **После каждого коммита** — обнови `docs/EXECUTION_STATE.md`.
6. **Под конец лимитов (<20%)** — перепиши ЭТОТ файл + Desktop-копию,
   закоммить, запушь (§8.6 п.7).

## Карта (читать по мере надобности, не всё сразу)

- `docs/EXECUTION_STATE.md` — где мы + NEXT ACTION (читать ПЕРВЫМ).
- `docs/MASTER_PLAN_2026-07-19.md` — фазы P0–P7, §8 протоколы.
- `docs/adr/ADR-001..003` — решения: TTS, image-провайдеры, b-roll.
- Медиа-код: `src/media/*` (piper/elevenlabs TTS, scene-markup/frames —
  Chrome-компоузер, broll-source — Pexels, image-source — FAL, music-bed,
  ffmpeg-args + manifest = schema-locked argv).
- Сэмплы Вадиму: `~/Видео/hermest-board-voice-samples/`.

## Контекст качества

Piper-голоса Вадим забраковал («отстой») — релизный голос ТОЛЬКО ElevenLabs
(George `JBFqnCBsd6RMkjVDRZzb`, Alice `Xb7hH8MSUJpSbSDYk0k2`, Aterna
`UX4FA7ZvSPh1ma6rI8P9` — его кастомный). Видео должно выглядеть как референсы
`~/Загрузки/hermest-board-dmitry-v2-premium-1080p.mp4` (брендированная
моушн-инфографика) + живые видеофоны по теме сцены (Pexels работает).
