# Overnight Strategy Workbench Log

Date: 2026-05-20

## Goal

Separate planning, marketing, copywriting, and material planning from the image generation page. The product flow is now:

Project profile -> Strategy Workbench -> Campaign Strategy Package -> Apply to Design Workbench -> Prompt compilation -> Image generation/editing/batch extension -> Quality delivery.

## Completed

### 1. Current-State Inventory

Confirmed existing features remain in place:

- Project profile / project asset library.
- Size presets.
- History asset library.
- Design assistant.
- Task center.
- Image generation/edit/fuse/mask/upscale APIs.
- Quality check.
- Project save/load.
- Image preview / result inspection panel.

No historical images were deleted. API Key configuration was not changed or exposed.

### 2. Campaign Strategy Package Data Structure

Added `lib/strategy.ts` with:

- `CampaignBrief`
- `MarketingStrategy`
- `CopySet`
- `MaterialPlanItem`
- `DesignDirection`
- `CampaignStrategyPackage`
- `StrategyRunInput`

The package contains:

- Activity goal.
- Target audience.
- User pain points.
- Core selling points.
- Campaign theme.
- Marketing directions.
- Main title, subtitle, short title, LED line, bus ad line, Xiaohongshu title, roll-up copy, video cover title.
- Recommended material list and dimensions.
- Design direction.
- Launch suggestion.
- Risk warnings.
- Forbidden content.
- Project id/name and timestamps.

### 3. Strategy APIs

Added dynamic strategy API:

- `POST /api/strategy/run`
- `POST /api/strategy/brief`
- `POST /api/strategy/marketing`
- `POST /api/strategy/copy`
- `POST /api/strategy/materials`
- `POST /api/strategy/save`
- `GET /api/strategy/list`
- `POST /api/strategy/apply-to-design`

Implementation note: these are implemented through `app/api/strategy/[action]/route.ts` to avoid duplicating route logic.

### 4. Strategy Workbench Page

Added independent page:

- `/strategy`

Layout:

- Left: project summary, project selection, history strategy packages.
- Middle: activity requirement input, planning analysis, marketing directions, copy set, material plan.
- Right: AI summary, design direction, risks, save/apply/copy actions.

The page is structured as a planning workbench, not a chat box.

### 5. Stage Controls

Each major module has controls for:

- Adopt current result.
- Regenerate the module.
- Manual editing mode.

The right side supports:

- Save strategy package.
- Apply to design.
- Generate main visual.
- Batch create material tasks.
- Copy as Prompt context.
- Open design workbench.

Current `Generate main visual` and `Batch create material tasks` apply the strategy to the design workbench first. Actual task auto-creation is reserved for the next pass.

### 6. Apply To Design Workbench

`POST /api/strategy/apply-to-design` writes the selected strategy package into the active project as `activeStrategyPackage`.

The design workbench now:

- Loads `activeStrategyPackage` from the project.
- Shows a right-panel summary:
  - Current strategy package.
  - Main title.
  - Recommended materials.
  - Design direction.
  - Protected content.
- Provides a left-rail link to the strategy workbench.

### 7. Prompt Compilation Reads Strategy Package

Prompt compilation now includes the active strategy package through `buildProjectConstraintText(...)`.

When a strategy is active, generation/edit prompts include:

- Project profile.
- Brand colors.
- Logo/phone/address/QR protection rules.
- Activity goal.
- Core selling points.
- Current material copy.
- Design direction.
- Launch scene.
- Target size/material plan.
- Protection rules.
- Negative constraints.

This keeps planning and generation decoupled while still making the strategy usable by design tasks.

## Files Changed

- `lib/strategy.ts`
- `app/api/strategy/[action]/route.ts`
- `app/api/project/route.ts`
- `app/strategy/page.tsx`
- `app/strategy/strategy-workbench-client.tsx`
- `app/workbench-client.tsx`
- `docs/overnight-strategy-workbench-log.md`
- `docs/manual-test-checklist.md`

## API Self-Test

Tested strategy generation for:

- `我要做一个胃肠镜体检活动`
- `我要做一个科技馆研学活动`
- `我要做一个专家坐诊宣传`
- `我要做一个小小志愿者招募活动`

Each produced:

- Planning brief.
- 3 marketing directions.
- Copy set.
- 6 material plan items.
- Design direction.
- Risk warnings.

Tested:

- `POST /api/strategy/run`: 200.
- `POST /api/strategy/save`: 200.
- `GET /api/strategy/list`: 200.
- `POST /api/strategy/apply-to-design`: 200.
- `GET /api/project`: active strategy package is present after apply.

## UI Self-Test

Verified in browser:

- `/strategy` opens.
- Strategy workbench layout renders.
- Requirement input works.
- Generate strategy package button works.
- Planning, marketing, copy, and material sections render.
- Save/apply/copy actions render.
- Apply to design works.
- Returning to `/` shows current strategy package in the design workbench right panel.

## Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with warnings only.
- `npm test`: not run because there is no test script.

Lint warnings are existing project-level warnings:

- React hook dependency warnings in the large workbench.
- `<img>` performance warnings.

## Real Implementation vs Reserved

### Real

- Strategy package data structure.
- Strategy generation rules.
- Strategy storage.
- Strategy listing.
- Apply to design project.
- Design workbench active strategy display.
- Prompt compilation with strategy context.
- Independent strategy workbench page.

### Reserved

- AI-based strategy generation using a model.
- Auto-create design nodes/tasks from `Generate main visual`.
- Auto-create batch material tasks from material plan.
- Per-material prompt selection in the design composer.
- Strategy package version diff and approval history.

## Tomorrow Acceptance Focus

Check one sentence:

Planning and image generation are separated, but can the strategy package be applied to design with one click?

Manual path:

1. Open `/strategy`.
2. Enter activity requirement.
3. Generate strategy package.
4. Review planning / marketing / copy / materials.
5. Save package.
6. Click Apply to Design.
7. Open `/`.
8. Confirm the design workbench shows the active strategy summary.
9. Run a text/image task and confirm the strategy context is included in prompt compilation.

