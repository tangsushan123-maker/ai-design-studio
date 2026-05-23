# Overnight Strategy Iteration Log

Date: 2026-05-20

## Main Acceptance Line

Planning and image generation stay separated, but a strategy package can be applied to the design workbench and read by prompt compilation.

## Round 1 - Full Flow Regression

### Checked

- Strategy workbench page opens at `/strategy`.
- Strategy generation creates planning brief, marketing directions, copy, material plan, design direction, and risk warnings.
- Four manual cases return complete structured packages:
  - 我要做一个胃肠镜体检活动
  - 我要做一个科技馆研学活动
  - 我要做一个专家坐诊宣传
  - 我要做一个小小志愿者招募活动
- Strategy package save/list/apply APIs return valid responses.
- Applying a strategy writes `activeStrategyPackage` into the active project.
- Design workbench can load the active strategy package.
- Prompt compilation reads the strategy package through `buildProjectConstraintText(...)`.

### Optimized

- Improved the design workbench right-panel strategy state.
- Added an explicit empty state when no strategy package is referenced:
  - “当前未引用企划策略包，可从企划工作台选择一个策略包引用到设计。”
- Expanded the active strategy summary to show:
  - Current strategy package name.
  - Project name.
  - Main title.
  - Core selling points.
  - Current material and target size.
  - Recommended materials.
  - Design direction.
  - Brand protection / forbidden content.

### Files Changed

- `app/workbench-client.tsx`
- `docs/overnight-strategy-iteration-log.md`
- `docs/manual-test-checklist.md`
- `docs/known-issues.md`

### Risk Control

- No historical images were deleted.
- No project data was cleared.
- API Key configuration was not changed.
- Existing generation, history, project, task center, and preview code paths were not removed.

## Test Status

Latest validation:

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with warnings only.

There is no `npm test` script in `package.json`.

Existing lint warnings:

- `react-hooks/exhaustive-deps` warnings in the large design workbench.
- Next.js `<img>` performance warnings in image-heavy panels.

## API Self-Check

Checked these endpoints against the local running app:

- `/api/health-openai`: 200.
- `/api/generated-images`: 200.
- `/api/project?mode=list`: 200.
- `/api/strategy/list`: 200.
- `/api/design-assistant/analyze`: 200.
- `/api/strategy/run`: 200.

The four required campaign cases all returned:

- Planning brief.
- 3 marketing directions.
- Copy set.
- 6 material plan items.
- Design direction.
- 4 risk warnings.

## UI Self-Check

- `/strategy` renders the independent planning workbench.
- Strategy page shows activity requirement input, project summary, strategy package history, and apply-to-design action.
- `/` design workbench loads.
- When the right panel is opened, it shows the active strategy summary:
  - Strategy package title.
  - Main title.
  - Core selling points.
  - Current material and target size.
  - Recommended materials.
  - Design direction.
  - Protection content.

## Round 2 - Feedback And Empty-State Tightening

### Optimized

- Strategy save now shows “正在保存策略包...” before the save request finishes.
- Strategy apply now shows “正在引用到设计工作台...” before the apply request finishes.
- Clipboard copy failure now shows a readable permission hint instead of silently failing.
- Project selector now shows a default empty option when no projects are found.
- Future automation buttons were renamed to avoid over-promising:
  - `引用后生成主视觉`
  - `引用后批量物料`

### Browser Regression

- Generated a strategy package from the UI.
- Confirmed planning brief, marketing directions, copy set, material list, save action, apply action, main-visual handoff, and batch-material handoff render after generation.
- Clicked `引用到设计`.
- Returned to `/`.
- Opened the right panel.
- Confirmed the design workbench shows the active strategy package, core selling points, current material, and protection content.
- Reloaded `/strategy`.
- Confirmed the applied strategy package appears in the historical strategy package list.

## Round 3 - Adoption Feedback Tightening

### Optimized

- Historical strategy package selection now also restores the original activity requirement into the input box.
- Strategy package history is now scoped to the current project, with a visible count of how many packages belong to this project.
- Generic `采用` buttons now provide visible feedback instead of behaving like inert controls.
- Marketing direction adoption now updates `selectedMarketingStrategyId`, refreshes `updatedAt`, and shows which direction was adopted.
- Material adoption now shows which material is selected and explains that Prompt context will prioritize it.

### Browser Regression

- Opened `/strategy`.
- Regenerated a strategy package from the UI.
- Confirmed planning, copy, and material sections render.
- Confirmed 13 adoption buttons are present after generation.
- Clicked the first `采用` action.
- Confirmed the page shows visible adoption feedback: `已采用当前企划分析。`

### Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with warnings only.

### Browser Regression

- Opened the design workbench with an active strategy package.
- Confirmed the right strategy card shows:
  - Material selector.
  - Prompt preview.
  - `生成主视觉`.
  - `批量物料`.
  - `完整Prompt`.
- Clicked `批量物料`.
- Confirmed 6 material tasks were created.
- Opened the task center and confirmed material tasks show:
  - Strategy title.
  - Material type.
  - Target size.
  - `运行` action.
- Switched current material to `小红书封面`.
- Confirmed the prompt preview changes to the selected material and size.
- Opened `完整Prompt`.
- Confirmed it shows current material, negative constraints, protection rules, editable prompt text, and `用编辑后的 Prompt 生成`.

## Round 4 - Project-Scoped Strategy History

### Optimized

- Strategy history in the planning workbench is now filtered to the active project only.
- Added a visible count of how many strategy packages belong to the current project.
- Improved the empty state wording so the history section now says `当前项目暂无保存的策略包。` when applicable.

### Browser Regression

- Opened `/strategy`.
- Confirmed the history block shows project-scoped strategy information.
- Confirmed the page still restores the active activity requirement and keeps the planning sections available.

### Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with warnings only.

## Round 5 - Project Switch State Reset

### Optimized

- Switching projects in the strategy workbench now clears the previous strategy package if the new project has none.
- When a project has an active strategy package, the workbench restores its original activity requirement into the input box.

### Browser Regression

- Opened `/strategy`.
- Switched from the active local project to the other project.
- Confirmed the previous strategy package no longer lingers.
- Confirmed the page shows the empty-state copy for the selected project:
  - `当前项目暂无保存的策略包。`
- Confirmed the selected project name is visible and the old strategy title is gone.

### Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with warnings only.

## Round 6 - Prompt Preview Visibility

### Optimized

- Added a compact `Prompt 预览（节选）` block in the design workbench right-panel strategy card.
- The preview is compiled from the active strategy package and its default material, so the user can verify that strategy context is entering the prompt chain.
- The preview is intentionally shortened to keep the right panel usable.

## Round 7 - Cleaner Default Design Mode

### Optimized

- Plain text-to-image now keeps the bottom composer as the primary entry.
- The right-side design assistant no longer duplicates the prompt workflow by default:
  - when there is no selected image and no active assistant plan, it collapses to a compact `打开设计助理` card;
  - image diagnosis and workflow analysis still expand when needed.
- Active strategy reference in the design workbench is now visually quieter:
  - the summary is compressed into a smaller collapsible card;
  - the detailed material selector / prompt inspector stay inside the expanded state only.
- Text-to-image placeholder copy was simplified to `请在这里输入生成的内容提示词。`

### White-Border Hardening

- Added a preprocessing step in `lib/image-utils.ts` for `smart_outpaint` / exact-canvas flows:
  - detect suspicious white borders on generated or edited source images;
  - trim obvious white-frame edges before final exact-size processing.
- Strengthened prompt rules in `lib/prompt.ts` so generation and resize flows now more explicitly prefer:
  - full-bleed output,
  - outpaint / relayout over forced blank padding,
  - no hard-cropping of key subjects to fit ratio.

### Visual Regression

- Captured the design workbench before and after the right-panel cleanup.
- Confirmed the second screenshot shows a much quieter default right panel in pure text-to-image mode, with the assistant collapsed behind a single action.

### Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with pre-existing warnings only.

### Notes

- `GET /api/health-openai` returned `ok: true`.
- A live `/api/generate-image` smoke run was started, but the upstream image response did not return within a reasonable manual check window, so this round does **not** claim a full live-image white-border verification yet.

## Round 7 - Main Visual And UI Tightening

### Optimized

- Fixed strategy-task prompt context so a task now reads its own bound strategy metadata instead of being silently overwritten by whatever material is currently selected in the right panel.
- Main visual creation now explicitly resets the active material back to `主视觉` and binds the task to:
  - `16:9`
  - `1920x1080`
  - main-visual strategy metadata
- Strengthened the main-visual prompt so it explicitly asks for a `1920x1080` horizontal hero visual instead of a vague “main visual”.
- Split the task center into two groups:
  - `待执行任务`
  - `运行中 / 已完成 / 失败`
- Updated the floating task dock so it shows both counts together, for example:
  - `0 个进行中 · 16 个待执行`
- Tightened the right-panel strategy card and prompt inspector with larger, more consistent typography.
- Enlarged history-card metadata and badges so the interface no longer relies on tiny 8px text in those primary surfaces.

### Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with existing warnings only.

### Notes

- This round focused on end-to-end correctness and readability, not on adding new features.
- The biggest production fix is that strategy-generated tasks now keep their own material context during execution.

## Round 8 - Task Preview And White-Border Gate

### Optimized

- Task-center result cards can now open the image preview directly through `查看结果`, instead of forcing the user to switch to history first.
- Task thumbnails are also clickable when a result exists.
- The right-panel top-level `资料` tab is now named `历史`, and the inner history segment is now named `历史记录`.
- Added an explicit editor note that:
  - safety guides and reference lines are preview-only,
  - they do not participate in generation,
  - they do not export into the final image,
  - they are never used as white padding.
- Renamed `下载排版 PNG` to `下载排版 PNG（无辅助线）` to reduce ambiguity.
- Tightened quality gating:
  - `size_insufficient`
  - `ratio_mismatch`
  - `white_border`
  - `failed`
  - `empty`
  
  These states no longer count as a successful delivery state in the task center.
- Strengthened prompt constraints so generated output must fill the target canvas and must not include white borders, transparent borders, or empty framing.

### Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with existing warnings only.

### Browser Regression

- Opened `/`.
- Opened the right panel.
- Confirmed the active strategy card still renders correctly.
- Confirmed the new prompt preview block is visible when a strategy package is active.

### Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with warnings only.

## Round 7 - Strategy Package To Design Task Automation

### Optimized

- Strategy workbench actions now go beyond simple apply:
  - `生成主视觉` writes an action command and opens the design workbench.
  - `批量创建物料任务` writes an action command and opens the design workbench.
- Design workbench now processes those commands after the active strategy package loads:
  - Main visual creates a real `text_to_image` node and starts running it.
  - Batch material creation creates one visible queued design task per material plan item.
- Added current material selection in the design workbench strategy card:
  - `主视觉`
  - Each strategy package material item such as `电子屏`, `小红书封面`, `公交广告`, etc.
- Prompt compilation now reads the selected material instead of always using the first material.
- Added full Prompt inspector in the design workbench:
  - Shows current material.
  - Shows negative constraints.
  - Shows protection rules.
  - Allows manual editing.
  - Can generate a task from the edited Prompt.
- Tasks and generated images now carry strategy trace fields:
  - `strategyPackageId`
  - `sourceStrategyTitle`
  - `materialPlanItemId`
  - `materialType`
  - `targetSize`
  - `prompt`
- History cards now show strategy source and material information when available.
- Strategy metadata is patched back into generated image metadata files for traceability.

### Current Automation Behavior

- Main visual: creates a node and starts generation automatically.
- Batch materials: creates queued material tasks and nodes; users can run each task deliberately from the task center.
- This keeps the first automation phase controllable and avoids firing many image generations at once.

### Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with warnings only.

## Tomorrow Priority Check

1. Open `/strategy`.
2. Select a project.
3. Generate a strategy package from an activity requirement.
4. Save the strategy package.
5. Click “引用到设计”.
6. Open `/`.
7. Confirm the right panel shows the active strategy summary with project, title, material, design direction, and protection rules.
8. Start a design task and confirm the compiled prompt includes strategy context.

## Round 8 - Deep Acceptance And Production Task Polish

### Checked

- Opened `/strategy` and generated a `胃肠镜体检活动策略包` from the UI.
- Clicked `批量创建物料任务` and confirmed the design workbench created 6 material tasks.
- Opened the task center and confirmed every material task shows:
  - Strategy title.
  - Material type.
  - Target size.
  - Manual `运行` action.
- Switched current material from `小红书封面` to `公交广告` and confirmed the Prompt preview changes with each material:
  - 小红书 uses `1080x1440` and the Xiaohongshu cover title.
  - 公交广告 uses `3900x400` and the bus-ad short copy.
- Clicked `生成主视觉` and confirmed it created a real main visual task, entered the task center, ran with `gpt-image-1`, and produced 2 history images.
- Confirmed generated images reached `2048x1152` and passed size/ratio quality check.

### Optimized

- Deferred batch material tasks no longer count as actively running tasks.
- Deferred batch material tasks no longer become `可能卡住` after 3 minutes just because they are waiting for the user to click `运行`.
- The floating task dock now says `待执行任务` for queued strategy material tasks instead of `任务进行中`.
- The task center no longer shows a spinning loader or `停止` button for deferred material tasks that have not started.
- Strategy history reading now exposes strategy trace metadata from generated image metadata:
  - `strategyPackageId`
  - `sourceStrategyTitle`
  - `materialPlanItemId`
  - `materialType`
  - `targetSize`
- Strategy metadata persistence is now awaited during the saving stage, reducing the chance that users navigate away before trace metadata is written.
- `主视觉` prompt compilation no longer silently falls back to the first material item. Material copy/size is included only when a material is explicitly selected.

### Files Changed

- `app/workbench-client.tsx`
- `lib/generated-history.ts`
- `lib/strategy.ts`
- `docs/overnight-strategy-iteration-log.md`
- `docs/manual-test-checklist.md`
- `docs/known-issues.md`

### Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with warnings only.

### Notes

- Existing lint warnings remain the same category: hook dependency warnings in the large workbench and Next.js `<img>` performance warnings.
- No historical images or project data were deleted.
- Two generated main visual outputs from this round were patched with strategy trace metadata for verification.

## Round 9 - Full Chain Verification And State Sync Repair

### Checked

- Opened `/strategy`, regenerated a fresh `胃肠镜体检活动策略包`, and confirmed the material plan now includes `PPT背景`.
- Confirmed the strategy workbench right panel shows:
  - current strategy package title,
  - project name,
  - main title,
  - core selling points,
  - selected material,
  - recommended materials,
  - design direction,
  - protection rules,
  - full Prompt preview,
  - `生成主视觉`,
  - `批量物料`,
  - `测试闭环`.
- Switched the current material selector from `电子屏` to `公交广告` and then to `小红书封面`; confirmed the Prompt preview changed with each material and used the correct copy and target size.
- Clicked `测试闭环` and confirmed it created:
  - 1 main-visual dry-run task,
  - 3 material dry-run tasks,
  - clear `测试模式 / 未真实生成` labels,
  - a visible success message.
- Opened the task center and confirmed the dry-run tasks show:
  - strategy source,
  - material type,
  - target size,
  - current state,
  - prompt preview,
  - run/delete controls,
  - human-readable test-mode wording.
- Clicked `批量物料` and confirmed it created 7 queued material tasks, including `PPT背景`.
- Clicked `生成主视觉` and confirmed it created a real main visual task and kept the strategy source in the prompt chain.
- Confirmed the design page prompt chain keeps reading strategy context from the active package.

### Optimized

- Added a safer project loader that merges the latest server project with the browser cache, so the design workbench no longer gets stuck on an older local snapshot when a strategy package has already been applied on the server.
- Removed the fallback that silently switched an invalid material selection back to the first material.
- Tightened the flow-state insertion so task failures are shown in a more sensible place in the status chain.

### Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with warnings only.

### Notes

- The end-to-end chain now has two modes:
  - real tasks for main visual and selectable material tasks,
  - dry-run tasks for test closure and queue verification.
- The remaining future work is still OCR-based text protection and programmatic text/Logo/QR re-paste.

## 2026-05-21 UI cleanup pass

### Focus

- Reduced default clutter in the design workbench so plain text-to-image goes back to a simpler "prompt first" flow.
- Fixed strategy-context leakage where an old active strategy package could accidentally influence a new plain text-to-image task.
- Simplified task visibility so the right panel defaults to `任务`, completed tasks auto-hide, and saved completed/cancelled tasks are no longer restored after reload.

### Changed

- Left rail labels were shortened to `新建 / 项目 / 档案` and spacing/typography were tightened.
- Right panel now opens in `任务` by default instead of jumping into the assistant.
- Selecting a node no longer force-switches the right panel to `参数`; the user can open `参数` manually.
- Strategy reference UI is now context-sensitive:
  - plain text-to-image no longer shows the old strategy block by default,
  - strategy details reappear only in strategy-relevant views or for strategy-linked nodes.
- Task cards were simplified to image + progress + status, with action buttons shown only when the task still needs intervention.
- Prompt constraints were strengthened to explicitly forbid white borders / poster-on-canvas framing and forbid auto-generated QR/Logo placeholders unless provided.

### Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with existing warnings only.

### Manual check notes

- Reloaded `/` and confirmed the right panel shows `任务 0` with an empty task state instead of opening a large assistant block by default.
- Confirmed plain design mode no longer exposes the strategy summary card when the current node/task is not strategy-linked.

## 2026-05-21 project memory panel simplification

### Focus

- Rebuilt the deleted `AssetLibraryPanel` and turned it from a heavy archive form into a lighter `项目记忆 / 素材库 / 风格引用 / 生成记录` panel.
- Kept the existing upload, preview, project-memory persistence, library reference, and generation-record wiring intact while reducing default visual weight.

### Changed

- Replaced the old multi-tab admin-style information architecture with four lighter tabs:
  - `项目记忆`
  - `素材库`
  - `风格引用`
  - `生成记录`
- `项目记忆` now defaults to a summary card plus six core fields, with extra archive fields folded under `更多信息`.
- `素材库` now opens as category counts first instead of a large full-image view; concrete items appear only after choosing a category.
- `风格引用` now uses compact cards and selectable chips for style preference, composition preference, and common sizes.
- `生成记录` now separates `历史设计` from `生成记录` with an inner switch so failed tasks stay in the run log instead of visually mixing with saved outputs.

### Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with existing warnings only.
