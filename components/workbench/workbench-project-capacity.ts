import { formatFileSize } from "@/lib/workbench-format";
import {
  projectCapacityImageCritical,
  projectCapacityImageWarning,
  projectCapacityJsonCriticalBytes,
  projectCapacityJsonWarningBytes,
  projectCapacityNodeCritical,
  projectCapacityNodeWarning,
} from "@/components/workbench/workbench-config";

export function projectCapacitySummary(input: { nodeCount: number; imageCount: number; jsonBytes: number }) {
  const issues: Array<{ tone: "warning" | "critical"; message: string }> = [];
  if (input.jsonBytes >= projectCapacityJsonCriticalBytes) {
    issues.push({ tone: "critical", message: `项目体积 ${formatFileSize(input.jsonBytes)}，接近 12MB 保存上限；建议清理旧任务和未保护图片，或拆成新项目。` });
  } else if (input.jsonBytes >= projectCapacityJsonWarningBytes) {
    issues.push({ tone: "warning", message: `项目体积 ${formatFileSize(input.jsonBytes)} 已超过建议值；继续增加节点和任务记录后，保存可能变慢。` });
  }
  if (input.nodeCount >= projectCapacityNodeCritical) {
    issues.push({ tone: "critical", message: `当前 ${input.nodeCount} 个节点，画布已经很大；建议保留关键结果，把探索过程拆到新项目。` });
  } else if (input.nodeCount >= projectCapacityNodeWarning) {
    issues.push({ tone: "warning", message: `当前 ${input.nodeCount} 个节点，已进入大型工作流；建议定期整理画布和删除无用节点。` });
  }
  if (input.imageCount >= projectCapacityImageCritical) {
    issues.push({ tone: "critical", message: `当前项目约 ${input.imageCount} 张结果图，图片管理和项目打开会变慢；建议清理未收藏、非素材、非节点引用图片。` });
  } else if (input.imageCount >= projectCapacityImageWarning) {
    issues.push({ tone: "warning", message: `当前项目约 ${input.imageCount} 张结果图，建议用图片管理批量清理可清理图片。` });
  }
  const issue = issues.find((item) => item.tone === "critical") || issues[0];
  return {
    message: issue?.message || "",
    tone: issue?.tone || "ok" as const,
  };
}
