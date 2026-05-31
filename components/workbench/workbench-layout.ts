import type { XYPosition } from "@xyflow/react";
import { treeBranchHorizontalGap, treeBranchVerticalGap } from "@/components/workbench/workbench-config";
import { imageNodePreviewMetrics } from "@/components/workbench/workbench-image-metrics";
import { variantNumberFromLabel } from "@/components/workbench/workbench-labels";
import type { FlowEdge, FlowNode, ImageAsset } from "@/components/workbench/workbench-types";

export function nodeAutoSpacingX(node: FlowNode) {
  if (node.type === "image_input") {
    const image = node.data.image || node.data.output || null;
    const width = imageNodePreviewMetrics(image as ImageAsset | null).nodeWidth;
    return Math.max(treeBranchHorizontalGap, width + 120);
  }
  return treeBranchHorizontalGap;
}

const workflowLayoutColumnGap = 390;
const workflowLayoutRowGap = Math.max(96, Math.round(treeBranchVerticalGap * 0.4));
const workflowLayoutRootGap = 112;

export function arrangeWorkflowNodes(nodes: FlowNode[], edges: FlowEdge[]) {
  if (nodes.length <= 1) return nodes;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const validEdges = edges.filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target));
  const originalOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const incoming = new Map<string, FlowEdge[]>();
  validEdges.forEach((edge) => {
    incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge]);
  });

  const primaryParent = new Map<string, string>();
  incoming.forEach((targetEdges, targetId) => {
    const sorted = [...targetEdges].sort((a, b) => {
      const handleDiff = layoutHandlePriority(a.targetHandle) - layoutHandlePriority(b.targetHandle);
      if (handleDiff) return handleDiff;
      const sourceA = nodeById.get(a.source);
      const sourceB = nodeById.get(b.source);
      const yDiff = (sourceA?.position.y || 0) - (sourceB?.position.y || 0);
      return yDiff || (originalOrder.get(a.source) || 0) - (originalOrder.get(b.source) || 0);
    });
    if (sorted[0]) primaryParent.set(targetId, sorted[0].source);
  });

  const primaryChildren = new Map<string, string[]>();
  primaryParent.forEach((sourceId, targetId) => {
    primaryChildren.set(sourceId, [...(primaryChildren.get(sourceId) || []), targetId]);
  });
  primaryChildren.forEach((children) => {
    children.sort((a, b) => compareLayoutNodes(nodeById.get(a), nodeById.get(b), originalOrder));
  });

  const roots = nodes
    .filter((node) => !primaryParent.has(node.id))
    .sort((a, b) => compareLayoutRoots(a, b, primaryChildren, originalOrder));
  if (!roots.length) roots.push([...nodes].sort((a, b) => compareLayoutNodes(a, b, originalOrder))[0]);

  const positioned = new Map<string, XYPosition>();
  const visited = new Set<string>();
  const baseX = 0;
  let cursorY = 0;

  function layoutSubtree(nodeId: string, depth: number, topY: number): number {
    const node = nodeById.get(nodeId);
    if (!node || visited.has(nodeId)) return 0;
    visited.add(nodeId);
    const nodeHeight = estimateWorkflowNodeHeight(node);
    const children = (primaryChildren.get(nodeId) || []).filter((childId) => !visited.has(childId));
    if (!children.length) {
      positioned.set(nodeId, { x: baseX + depth * workflowLayoutColumnGap, y: topY });
      return nodeHeight + workflowLayoutRowGap;
    }

    let childCursor = topY;
    const childRanges: Array<{ y: number; height: number }> = [];
    children.forEach((childId) => {
      const childHeight = layoutSubtree(childId, depth + 1, childCursor);
      const childPosition = positioned.get(childId);
      if (childPosition && childHeight) {
        childRanges.push({ y: childPosition.y, height: estimateWorkflowNodeHeight(nodeById.get(childId) as FlowNode) });
        childCursor += childHeight;
      }
    });

    if (!childRanges.length) {
      positioned.set(nodeId, { x: baseX + depth * workflowLayoutColumnGap, y: topY });
      return nodeHeight + workflowLayoutRowGap;
    }

    const first = childRanges[0];
    const last = childRanges[childRanges.length - 1];
    const childrenCenter = (first.y + last.y + last.height) / 2;
    const subtreeHeight = Math.max(childCursor - topY - workflowLayoutRowGap, nodeHeight);
    positioned.set(nodeId, {
      x: baseX + depth * workflowLayoutColumnGap,
      y: Math.max(topY, Math.round(childrenCenter - nodeHeight / 2)),
    });
    return subtreeHeight + workflowLayoutRowGap;
  }

  roots.forEach((root) => {
    const blockHeight = layoutSubtree(root.id, 0, cursorY);
    cursorY += Math.max(blockHeight, estimateWorkflowNodeHeight(root) + workflowLayoutRootGap);
  });

  nodes
    .filter((node) => !visited.has(node.id))
    .sort((a, b) => compareLayoutNodes(a, b, originalOrder))
    .forEach((node) => {
      positioned.set(node.id, { x: baseX, y: cursorY });
      cursorY += estimateWorkflowNodeHeight(node) + workflowLayoutRootGap;
    });

  return nodes.map((node) => ({
    ...node,
    position: positioned.get(node.id) || node.position,
  }));
}

export function filterEdgesForNodes(edges: FlowEdge[], nodes: FlowNode[]) {
  const ids = new Set(nodes.map((node) => node.id));
  return edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
}

export function normalizeRestoredCanvasPositions(nodes: FlowNode[]) {
  if (!nodes.length) return nodes;
  const bounds = restoredCanvasBounds(nodes);
  if (!bounds) return nodes;
  const { minX, minY, maxX, maxY } = bounds;
  const needsNormalize = Math.max(Math.abs(minX), Math.abs(minY), Math.abs(maxX), Math.abs(maxY)) > 6000;
  if (!needsNormalize) return nodes;
  const offsetX = minX - 120;
  const offsetY = minY - 120;
  return nodes.map((node, index) => {
    const position = Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y)
      ? node.position
      : { x: 120 + index * 80, y: 120 + index * 40 };
    return {
      ...node,
      position: {
        x: Math.round((position.x - offsetX) * 100) / 100,
        y: Math.round((position.y - offsetY) * 100) / 100,
      },
    };
  });
}

function restoredCanvasBounds(nodes: FlowNode[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasPosition = false;
  for (const node of nodes) {
    const position = node.position;
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) continue;
    hasPosition = true;
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
  }
  return hasPosition ? { minX, minY, maxX, maxY } : null;
}

export function estimateWorkflowNodeHeight(node: FlowNode) {
  if (node.data.kind === "image_input") {
    const image = (node.data.image || node.data.output || null) as ImageAsset | null;
    return imageNodePreviewMetrics(image).estimatedNodeHeight + (node.data.outputs && node.data.outputs.length > 2 ? 24 : 0);
  }
  const outputs = Array.isArray(node.data.outputs) ? node.data.outputs : node.data.output ? [node.data.output] : [];
  if (outputs.length > 1) return 172;
  if (outputs.length === 1) return 148;
  if (node.data.kind === "mask_edit") return 156;
  return 128;
}

function compareLayoutRoots(a: FlowNode, b: FlowNode, children: Map<string, string[]>, originalOrder: Map<string, number>) {
  const childDiff = Number(Boolean(children.get(b.id)?.length)) - Number(Boolean(children.get(a.id)?.length));
  if (childDiff) return childDiff;
  return compareLayoutNodes(a, b, originalOrder);
}

function compareLayoutNodes(a: FlowNode | undefined, b: FlowNode | undefined, originalOrder: Map<string, number>) {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  const kindDiff = layoutKindPriority(a) - layoutKindPriority(b);
  if (kindDiff) return kindDiff;
  const variantDiff = imageVariantForLayout(a) - imageVariantForLayout(b);
  if (variantDiff) return variantDiff;
  const yDiff = a.position.y - b.position.y;
  return yDiff || a.position.x - b.position.x || (originalOrder.get(a.id) || 0) - (originalOrder.get(b.id) || 0);
}

function layoutKindPriority(node: FlowNode) {
  if (node.data.kind === "text_to_image") return 0;
  if (node.data.kind === "image_input" && !node.data.output && !node.data.image) return 1;
  if (node.data.kind === "image_input") return 2;
  if (node.data.kind === "fuse_images") return 3;
  if (node.data.kind === "resize" || node.data.kind === "outpaint") return 4;
  if (node.data.kind === "reference_remake" || node.data.kind === "design_optimize") return 5;
  if (node.data.kind === "png_layers") return 6;
  if (node.data.kind === "output") return 7;
  return 6;
}

function layoutHandlePriority(handle?: string | null) {
  if (!handle || handle === "image" || handle === "source") return 0;
  if (handle === "imageA" || handle === "sourceImage") return 1;
  if (handle === "imageB" || handle === "productImage") return 2;
  return 3;
}

function imageVariantForLayout(node: FlowNode) {
  const image = (node.data.output || node.data.image || node.data.outputs?.[0] || null) as ImageAsset | null;
  return image?.variant || variantNumberFromLabel(image?.branchLabel || node.data.title || "") || 0;
}
