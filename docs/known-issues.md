# Known Issues

Date: 2026-05-28

## Strategy Workbench

- Strategy generation is currently rule-based. It is stable and structured, but not yet using a model to deeply reason over unusual campaign briefs.
- `生成主视觉` now creates and runs a text-to-image node automatically.
- `批量创建物料任务` now creates queued material tasks and nodes, but intentionally does not auto-run all image generations yet.
- Queued material tasks are intentionally `待执行`; they should not be treated as stuck unless the user actually starts them. They are now grouped separately in the task center.
- `测试闭环` is intentionally a dry-run flow. It creates visible tasks and a sample result binding, but does not batch-call the image API.
- The design workbench has a current material selector in the right panel; a second selector inside the bottom composer is still reserved.
- New strategy packages include `PPT背景` in the material plan.
- Strategy package history is now project-scoped, but search, filter, and version comparison are still reserved.
- Adoption actions now have feedback, but there is not yet a full approval audit trail showing who adopted which section and when.
- Legacy crop mode still exists for compatibility in older nodes or manually forced settings, but new quick resize paths default to smart outpaint and should not surface crop by default.

## Prompt And Production

- Prompt compilation now prefers the task's own bound strategy metadata at execution time. This prevents a main-visual task from being accidentally polluted by a different material currently selected in the UI.
- Plain text-to-image no longer auto-consumes an active strategy package unless the task is explicitly strategy-linked; this keeps project-to-project behavior predictable.
- `主视觉` no longer silently uses the first material; material copy and size are included only after a material is selected.
- The design workbench shows a shortened preview and an editable full Prompt inspector.
- Strategy-generated history images can now expose strategy package title, strategy package ID, material type, and target size when those fields exist in image metadata.
- Text/logo/QR protection is represented as prompt constraints and project rules. OCR-based region locking and programmatic text re-paste are still future work.
- The design page now merges the browser cache with the latest server project so an applied strategy package does not disappear after a reload.

## UI And Visual Polish

- The design workbench is moving toward a more restrained Apple-style visual system, but typography still needs one more pass across the remaining secondary surfaces.
- Some smaller internal admin text still uses older tiny utility sizes outside the main task/history/strategy areas.
- The plain text-to-image default state is now calmer, but the left floating rail and some secondary panel copy can still be reduced further in a future UI cleanup pass.
- Node cards and secondary project/archive panels still contain mixed `text-[9px] / text-[10px] / text-[11px]` sizing; one more normalization pass is still recommended.
- Browser-side automation had intermittent trouble filling the bottom composer in the in-app browser, so one manual click-through pass is still recommended for final polish validation.

## Project Archive And Material Libraries

- Auto-search for public organization facts now fetches public search results and records `待确认` candidates before writing them into project memory. It is still best treated as an assistive lookup, not an authoritative data source.
- Uploads currently focus on image assets. Document, video, and screenshot ingestion data structures are reserved, but the UI flow is still intentionally simple.
- Cross-project reference is now intentionally compact, but copy-into-project is still a light helper action rather than a full audit-tracked asset import workflow.
- The project archive/material library panel is now intentionally positioned as `项目记忆与素材调用`, not as a full enterprise DAM. More advanced bulk management is still intentionally out of scope for this version.

## Validation Notes

- `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` are the current verification chain for code changes.
- The large workbench component is still intentionally centralized; keep changes narrow and covered by focused source-level assertions when possible.
- Live image generation can still be slow depending on the configured upstream gateway. A slow response should not be confused with the local white-border post-processing path failing.

## Safety Notes

- Do not delete `strategies.local.json`, `projects.local.json`, `project.local.json`, or generated image folders during testing.
- Do not expose API Key values in frontend panels, logs, or docs.
