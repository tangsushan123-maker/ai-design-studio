# Manual Test Checklist

## Strategy Workbench

- [ ] Open `/strategy`.
- [ ] Confirm the page is independent from the design/image generation page.
- [ ] Confirm left panel shows project summary.
- [ ] Confirm center panel has activity requirement input.
- [ ] Confirm right panel has AI summary, risk warnings, and next actions.

## Project Archive And Material Library

- [ ] Open the left project drawer and confirm the new project-creation modal appears.
- [ ] Create a project with only an organization name.
- [ ] Confirm the project archive is created separately from other projects.
- [ ] Confirm the project has its own independent material library by default.
- [ ] Confirm project name, organization name, phone, address, website, brand colors, fonts, slogans, and forbidden content can be edited in the archive panel.
- [ ] Confirm the archive panel has protection switches for text, Logo, QR code, face, main subject, and masked-area-only edits.
- [ ] Upload a few project assets and confirm they stay in the current project only.
- [ ] Search current project assets by filename, scene, tag, size, or source label.
- [ ] Reference another project library in read-only mode and confirm it shows up in the active references list.
- [ ] Reference another project library in copy-into-project mode and confirm the copied items appear in the current project library.
- [ ] Reference a public style library such as Apple, Xiaomi, or 高端医疗 and confirm it is listed separately from project libraries.
- [ ] Confirm the design prompt context includes the active project archive and library references.
- [ ] Confirm deleting a project asks for a second confirmation.
- [ ] Reload the page and confirm project archive and library references persist.

## Strategy Generation Cases

Run these prompts:

- [ ] 我要做一个胃肠镜体检活动
- [ ] 我要做一个科技馆研学活动
- [ ] 我要做一个专家坐诊宣传
- [ ] 我要做一个小小志愿者招募活动

For each prompt, confirm:

- [ ] Planning brief is generated.
- [ ] 3 marketing directions are generated.
- [ ] Copy set is generated.
- [ ] Material list is generated.
- [ ] Design direction is generated.
- [ ] Risk warnings are generated.

## Editing And Approval

- [ ] Toggle manual editing mode.
- [ ] Edit a main title.
- [ ] Edit one material copy.
- [ ] Select a marketing direction using Adopt.
- [ ] Confirm adopting a marketing direction shows a visible success message.
- [ ] Select one material using Adopt.
- [ ] Confirm adopting one material says Prompt context will prioritize it.
- [ ] Click the generic Adopt button in planning/copy/material sections and confirm it gives visible feedback.
- [ ] Regenerate brief.
- [ ] Regenerate marketing.
- [ ] Regenerate copy.
- [ ] Regenerate materials.

## Save And Reuse

- [ ] Click Save Strategy Package.
- [ ] Reload `/strategy`.
- [ ] Confirm the package appears in historical strategy packages.
- [ ] Confirm history only shows packages for the current project and shows the project count.
- [ ] Confirm the history block says `当前项目暂无保存的策略包。` when nothing has been saved for this project.
- [ ] Click a historical strategy package.
- [ ] Confirm it loads into the workbench.
- [ ] Confirm the original activity requirement is restored into the input field.
- [ ] Switch to another project with no strategy package and confirm the old package is cleared.

## Apply To Design

- [ ] Click Apply to Design.
- [ ] Open `/`.
- [ ] Open the right panel if it is collapsed.
- [ ] If no package is referenced, confirm the empty state says: 当前未引用企划策略包，可从企划工作台选择一个策略包引用到设计。
- [ ] Confirm it shows:
  - [ ] Current strategy package title.
  - [ ] Project name.
  - [ ] Main title.
  - [ ] Core selling points.
  - [ ] Current material and target size.
  - [ ] Recommended materials.
  - [ ] Design direction.
  - [ ] Protected content summary.
  - [ ] Forbidden content when the project has any.
  - [ ] A compact prompt preview excerpt.

- [x] Confirm the design page can recover an applied strategy package after returning from `/strategy` without staying on an old empty snapshot.

## Strategy Driven Design Tasks

- [x] In `/strategy`, click `生成主视觉`.
- [x] Confirm the app opens `/`.
- [x] Confirm task center receives a main visual generation task.
- [x] Confirm the main visual task prompt contains campaign goal, selling points, title, design direction, and protection rules.
- [x] Confirm main visual does not incorrectly use the first material copy/size unless a material is selected.
- [x] Confirm generated main visual images enter history and keep strategy source metadata.
- [x] In `/strategy`, click `批量创建物料任务`.
- [x] Confirm the app opens `/`.
- [x] Confirm task center contains one queued task per material plan item.
- [x] Confirm each queued task shows material type and target size.
- [x] Wait more than 3 minutes and confirm unstarted material tasks remain `等待中/待执行`, not `可能卡住`.
- [x] Confirm the floating task dock says `待执行任务` for unstarted batch material tasks.
- [x] Click `运行` on one queued material task and confirm it starts as a normal node task.
- [x] In the design workbench right panel, switch current material from `主视觉` to `电子屏`.
- [x] Confirm prompt preview changes to electronic screen copy and target size.
- [x] Switch to `小红书封面`.
- [x] Confirm prompt preview changes to Xiaohongshu title and target size.
- [x] Open `完整Prompt`.
- [x] Confirm positive prompt, negative constraints, protection rules, current material copy, target size, and scene are visible.
- [x] Edit the Prompt and click `用编辑后的 Prompt 生成`.
- [x] Confirm the created task records strategy package and material source.
- [x] Confirm `测试闭环` creates 1 main-visual dry-run task plus 3 material dry-run tasks.
- [x] Confirm dry-run tasks keep the `测试模式 / 未真实生成` label and do not fake a real image generation result.
- [x] Confirm `批量物料` now creates 7 queued tasks, including `PPT背景`.
- [x] Confirm the resize quick controls no longer surface `居中裁切` as a default option.
- [x] Confirm `PPT` and `1:1` presets default to non-crop smart outpaint behavior.
- [x] Confirm Logo / QR are only protected when explicitly provided, not treated as mandatory placeholders.
- [x] Confirm `POST /api/design-assistant/analyze` returns a readable 400 on empty JSON-less requests.
- [x] Confirm switching from a medical project to `扬州科技馆` does not keep the old strategy package in the prompt path.
- [x] Confirm plain text-to-image only uses project archive/material context unless a strategy package is explicitly applied.
- [ ] Confirm `生成主视觉` creates a task whose target size is `1920x1080`.
- [ ] While a non-main material is selected in the right panel, run a previously created main-visual task and confirm it still keeps main-visual prompt context.
- [ ] Confirm the task center separates `待执行任务` from `运行中 / 已完成 / 失败`.
- [ ] Confirm the floating task dock shows both counts together when queued material tasks exist.

## Prompt Compilation

- [ ] With an active strategy package, run or prepare a design task.
- [ ] Switch current material before running the task.
- [ ] Confirm generated prompt context includes:
  - [ ] Project profile.
  - [ ] Brand colors.
  - [ ] Logo / phone / address / QR protection rules.
  - [ ] Activity goal.
  - [ ] Core selling points.
  - [ ] Current material copy.
  - [ ] Design direction.
  - [ ] Target material and size.
  - [ ] Negative constraints.
  - [ ] The selected material, not always the first material.

- [x] Confirm the current material selector contains `主视觉`, `电子屏`, `小红书封面`, `公交广告`, `电梯海报`, `易拉宝`, `视频封面`, and `PPT背景`.

## Existing Design Workbench Regression

- [ ] Open `/`.
- [ ] Confirm React Flow canvas renders.
- [ ] Confirm bottom composer renders.
- [ ] Confirm plain text-to-image default mode keeps the bottom composer as the main input.
- [ ] Confirm the right panel opens on `任务`, not `助理`, after a clean reload.
- [ ] Confirm selecting a node does not force the panel away from `任务`; `参数` should open only when clicked manually.
- [ ] Confirm a non-strategy text-to-image node does not show the strategy summary block in the right panel.
- [ ] Confirm the right panel shows a compact `打开设计助理` card instead of the full analysis form when there is no selected image.
- [ ] Confirm the right panel does not clear canvas contents after visiting `/strategy` and returning.
- [ ] Confirm the right panel shows a prompt preview excerpt when a strategy package is active.
- [ ] Confirm upload/paste/drag image entry still works.
- [ ] Confirm right panel tabs still render.
- [ ] Confirm history still renders.
- [ ] Confirm strategy-generated history cards show source strategy and material.
- [ ] Confirm image preview shows `来自企划`, `策略ID`, and `物料` for strategy-generated images.
- [ ] Confirm image preview still opens.
- [ ] Confirm task center still renders.
- [ ] Confirm completed tasks auto-hide and do not come back after a reload/save cycle.
- [ ] Confirm task cards now show thumbnail + progress + status as the main information.
- [ ] Confirm settings page still opens.
- [ ] Run one plain text-to-image prompt and confirm the result does not show obvious white borders or blank frame edges.

## Project Memory And Asset Panel

- [ ] Open the `项目档案与素材库` panel and confirm it now shows exactly 4 tabs: `项目记忆 / 素材库 / 风格引用 / 生成记录`.
- [ ] Confirm the panel header summary shows current project, material count, style count, and record count without a long form by default.
- [ ] Confirm `项目记忆` defaults to summary rows, not a large always-open input form.
- [ ] Click `编辑项目记忆` and confirm core fields can still be edited and persisted.
- [ ] Expand `更多信息` and confirm website / wechat / map link / fonts / forbidden content / notes / document summary are folded there.
- [ ] Confirm `素材库` defaults to category cards and counts, not a large waterfall of images.
- [ ] Click a category and confirm compact thumbnails can still preview uploaded materials.
- [ ] Confirm `风格引用` uses compact style cards and chip-style preferences instead of long rule paragraphs.
- [ ] Confirm `生成记录` can switch between `历史设计` and `生成记录`.
- [ ] Confirm failed tasks only appear inside `生成记录`, not inside `历史设计`.

## Safety

- [ ] No historical images were deleted.
- [ ] No project data was cleared.
- [ ] API Key is not visible on frontend.
- [ ] Existing generation APIs still build.
