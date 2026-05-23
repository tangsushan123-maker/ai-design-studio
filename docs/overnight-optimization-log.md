# Overnight Optimization Log

Date: 2026-05-20

## Goal

Move the app closer to a stable AI design production workbench: design assistant planning, asset/history management, project brand constraints, protection switches, quality checks, workflow templates, and safe self-testing.

## Round 1 - Production Planning And Protection Basics

### Completed

- Strengthened design assistant rule parsing:
  - Recognizes Xiaohongshu, Douyin/vertical, video cover, WeChat article cover, elevator poster, roll-up banner, bus ad, LED screen, PPT, A4 landscape, and A4 portrait.
  - Extracts preset target sizes when users speak casually, for example `电子屏 3000x300`, `公交广告`, `公众号封面`, `A4竖版`.
  - Expands protection intent parsing for hospital name, phone, address, price, doctor name, Logo, QR code, face/expert photo, subject/product, and masked-only edits.
  - Merges project brand memory into assistant protection rules.
- Added project-level protection switches in the project asset library:
  - `keepText`
  - `keepLogo`
  - `keepQrCode`
  - `keepFace`
  - `keepMainSubject`
  - `onlyEditMaskedArea`
- Connected protection switches into prompt constraints and protection context:
  - Important text, Logo, QR code, face/photo, subject/product, and masked edit rules now flow into generation constraints.
  - Derived editable layers lock state now respects project protection switches.
- Improved image preview quality panel:
  - Shows source task id when available.
  - Shows quality-check suggested actions such as regenerate, remove white border, or inspect text/Logo/QR code.
- Fixed WeChat article cover preset ratio metadata:
  - `公众号封面` now uses `custom` ratio with `900x383`, avoiding false 16:9 assumptions.

### Files Changed

- `app/workbench-client.tsx`
- `lib/design-assistant.ts`
- `docs/overnight-optimization-log.md`

### Tests

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with existing warnings only:
  - React Hook dependency warnings in the long-lived workbench effects.
  - Next.js `<img>` optimization warnings.
- `npm test`: not run because `package.json` has no test script.

### API Self-Check

- `GET /api/health-openai`: 200, returned configured API base URL and model names without exposing the API key.
- `GET /api/generated-images`: 200, returned `images` and `saveDir`; current history count observed: 118.
- `GET /api/project?mode=list`: 200, returned active project id and project list.
- `POST /api/design-assistant/analyze`: 200, returned structured plan for:
  - `改成小红书封面，文字不要变，logo不要动`
  - `生成4K高清`
  - `只改我涂抹的地方，其他不要动`
  - `电子屏 3000x300`
  - `公交广告比例`
  - `公众号封面，电话和logo不要动`
  - `A4横版 / A4竖版`
- `POST /api/workflow/run`: 501 by design, returned a clear placeholder message and received node/edge counts.

### UI Self-Check

- Main page opens at `http://127.0.0.1:3000/`.
- React Flow canvas renders existing nodes and edges.
- Bottom composer renders upload button, ratio selector, model selector, prompt box, and disabled generate state when prompt is empty.
- Right panel opens and shows assistant/parameter/task/history/template/batch tabs.
- Project asset library opens from the left panel.
- Project asset library now shows the new protection switch group.
- History preview/lightbox opens.
- Result inspection panel shows quality status, source information, prompt, layer editor, safety guides, and download actions.
- Narrow viewport remains usable: the preview panel scrolls and footer actions are horizontally scrollable.

### Fixes During Self-Check

- Fixed `A4竖版` being misread as generic Douyin vertical because `竖版` matched before the A4 preset.
- Confirmed A4 landscape/portrait now resolve to:
  - A4横版: `3508x2480`
  - A4竖版: `2480x3508`

### Notes / Placeholders

- OCR and programmatic text re-paste are still planned, not implemented in this round.
- Protection switches currently drive data structure, prompt constraints, layers, and quality risk context. They do not yet perform pixel-level logo/QR/person detection.
- No historical images or project data were deleted.
- Git commit was not created because this folder is not a git repository.
- API Key configuration was not modified.

## Tomorrow Morning Check List

- In the project asset library, toggle each protection switch and confirm saved project state is retained after reload.
- In design assistant, test:
  - `改成小红书封面，文字不要变`
  - `生成4K高清`
  - `只改我涂抹的地方，其他不要动`
  - `电子屏 3000x300`
  - `公交广告比例`
  - `A4竖版，二维码不要变`
- Open a history image and check the preview panel:
  - Quality status and suggested actions.
  - Source task field.
  - Layer editor and editable text.
  - Download PNG/JPG and layout PNG.
- Apply a resize preset for `公众号封面` and verify it uses `900x383` rather than a false 16:9 ratio.

## Round 2 - Project Archive / Material Library Isolation

### Completed

- Added a structured project knowledge model with:
  - project archive
  - project material library
  - project library references
  - public style libraries
  - selection state for active references
- Upgraded project persistence so each project now carries its own isolated knowledge bundle instead of only legacy `profile/assets/text` fields.
- Added a new `/api/material-libraries` endpoint:
  - lists project libraries
  - lists seeded public style libraries
  - supports detail mode with library items
- Seeded public style libraries for common design references:
  - Apple, Xiaomi, Huawei, Nike, MUJI, IKEA
  - 高端医疗, 医疗健康, 科技馆科普, 亲子活动, 政务党建, 中医国风
  - 现代商业海报, 户外广告, 电梯海报, 公交广告, 大屏电子屏, 微信公众号封面
- Upgraded the left-side project entry to create a real project-creation modal instead of instantly wiping the canvas:
  - project name
  - organization name
  - auto-search placeholder
  - independent project library
  - reference existing project libraries
  - reference public style libraries
  - read-only or copy-into-project mode
- Reworked the old project asset drawer into a structured project information panel with tabs:
  - 项目档案
  - 项目素材
  - 引用素材库
  - 历史设计
  - 生成记录
  - 风格设置
- Updated design prompt context so generation now reads the current project archive and active library references instead of only a single free-form note block.
- Added delete confirmation for projects to avoid accidental removal.
- Preserved all existing generation, history, quality-check, and task-center behavior.

### Files Changed

- `app/workbench-client.tsx`
- `app/api/project/route.ts`
- `app/api/material-libraries/route.ts`
- `lib/project-system.ts`
- `docs/overnight-optimization-log.md`

### Tests

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with existing warnings only.

## Round 4 - No-Crop Default And Optional QR/Logo

### Completed

- Switched AI redraw and masked-edit output processing to `smart_outpaint` so exact-size outputs keep the full画面 instead of defaulting to crop.
- Removed crop from the quick resize mode chips so the default UI no longer nudges users toward cutting content.
- Tuned resize and outpaint prompt text to say Logo/二维码 are only protected when they are explicitly present or provided, instead of treating them as mandatory elements.
- Updated size preset recommendations so `PPT` and `1:1` now default to no-crop smart outpaint behavior.

### Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with existing warnings only.
- API checks on the existing local dev server at `http://127.0.0.1:3000`:
  - `GET /api/health-openai`: 200, API Key configured.
  - `GET /api/generated-images`: 200, returned history list with quality metadata.
  - `GET /api/project?mode=list`: 200, returned the active project summary.
  - `POST /api/design-assistant/analyze`: now returns a human-readable 400 when called without a JSON body.

### Notes

- QR code and Logo remain optional. If the user does not explicitly provide them, the system should not invent or reserve them.
- Legacy crop mode still exists for compatibility in stored or manual configurations, but it is no longer the default quick path.

## Round 5 - Project Isolation And Explicit Strategy Only

### Completed

- Hardened project isolation so local cache only merges into the same project ID, preventing a previous project's strategy package from leaking into the current project.
- Changed the design workbench's default prompt path so plain text-to-image no longer auto-consumes the active strategy package unless the task is explicitly strategy-linked.
- Kept strategy prompts and tasks available for explicit `/strategy -> apply to design` flows, but removed the silent fallback for normal composer runs.

### Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with existing warnings only.

### Notes

- If a task was created without explicit strategy metadata, it now uses only the current project archive/material context.
- Active strategy packages are still available when intentionally引用到设计, but stale cross-project packages are ignored.

### API Self-Check

- `GET /api/project?mode=list`: 200, returned the active project and project summary list.
- `GET /api/material-libraries?mode=detail`: 200, returned 1 project library and 18 public style libraries.

### Notes / Placeholders

- Auto-search for public organization info is only a data placeholder in this round.
- Document/video/reference ingestion is structurally reserved but not yet fully uploaded through the UI.
- Copy-into-project mode now copies referenced library items into the current project knowledge bundle, but only if the source library items are available in detail mode.
- No project data, historical images, or API keys were deleted or exposed.

## Round 3 - Plain Text-To-Image UI Simplification

### Completed

- Kept plain text-to-image on the central composer path by default.
- Removed the implicit “selected image = reference flow” behavior from the bottom composer.
- Moved ratio and quality controls into the composer so the core input stays in one place.
- Hid the strategy summary block in the right panel when no strategy package is referenced.
- Softened the left-rail node entry from a highlighted primary button to a regular toolbar button.
- Removed dead composer auto-routing helpers after the simplification.

### Tests

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with existing warnings only.
