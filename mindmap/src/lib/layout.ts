import { MindMapNode } from '../types/mindmap';

export interface LayoutNode {
  id: string;
  node: MindMapNode;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge {
  id: string;
  fromId: string;
  toId: string;
  depth: number;
  path: string;
  stroke: string;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

const HORIZONTAL_GAP = 64;
const VERTICAL_GAP = 18;
const PADDING_X = 64;
const PADDING_Y = 56;

export function getNodePalette(depth: number): {
  bg: string;
  border: string;
  text: string;
  edge: string;
} {
  if (depth === 0) {
    return {
      bg: '#0B2A5B',
      border: '#0B2A5B',
      text: '#FFFFFF',
      edge: '#0E7478',
    };
  }
  if (depth === 1) {
    return {
      bg: '#E2F3F2',
      border: '#127A7D',
      text: '#0F2937',
      edge: '#C78A1B',
    };
  }
  if (depth === 2) {
    return {
      bg: '#FDF3DF',
      border: '#C78A1B',
      text: '#1F2937',
      edge: '#2B6CB0',
    };
  }
  return {
    bg: '#EBF3FE',
    border: '#2B6CB0',
    text: '#1E293B',
    edge: '#64748B',
  };
}

function measureNodeSize(
  node: MindMapNode,
  depth: number,
): { width: number; height: number } {
  if (depth === 0) {
    const words = node.text.trim();
    const lines = Math.max(1, Math.min(4, Math.ceil(words.length / 13)));
    const width = Math.max(152, Math.min(220, words.length * 9 + 44));
    const height = Math.max(76, 36 + lines * 22);
    return { width, height };
  }

  const charCount = node.text.trim().length;
  const maxWidth = 390;
  const minWidth = 104;
  const rawWidth = charCount * 7.8 + 42 + (node.children.length > 0 ? 18 : 0);
  const width = Math.max(minWidth, Math.min(maxWidth, Math.round(rawWidth)));
  const approxLines = Math.max(1, Math.ceil(rawWidth / maxWidth));
  const height = Math.max(44, 22 + approxLines * 20);

  return { width, height };
}

interface MeasuredSubtree {
  node: MindMapNode;
  depth: number;
  width: number;
  height: number;
  subtreeHeight: number;
  children: MeasuredSubtree[];
}

function measureSubtree(node: MindMapNode, depth: number): MeasuredSubtree {
  const { width, height } = measureNodeSize(node, depth);
  const visibleChildren = node.collapsed ? [] : node.children;
  const measuredChildren = visibleChildren.map((child) =>
    measureSubtree(child, depth + 1),
  );

  if (measuredChildren.length === 0) {
    return {
      node,
      depth,
      width,
      height,
      subtreeHeight: height,
      children: [],
    };
  }

  const childrenTotalHeight =
    measuredChildren.reduce((sum, item) => sum + item.subtreeHeight, 0) +
    VERTICAL_GAP * (measuredChildren.length - 1);

  return {
    node,
    depth,
    width,
    height,
    subtreeHeight: Math.max(height, childrenTotalHeight),
    children: measuredChildren,
  };
}

export function computeMindMapLayout(root: MindMapNode): LayoutResult {
  const measured = measureSubtree(root, 0);
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  let maxX = 0;
  let maxY = 0;

  function place(subtree: MeasuredSubtree, x: number, topY: number): LayoutNode {
    const centerY = topY + subtree.subtreeHeight / 2;
    const nodeY = centerY - subtree.height / 2;

    const placed: LayoutNode = {
      id: subtree.node.id,
      node: subtree.node,
      depth: subtree.depth,
      x,
      y: nodeY,
      width: subtree.width,
      height: subtree.height,
    };

    nodes.push(placed);
    maxX = Math.max(maxX, x + subtree.width);
    maxY = Math.max(maxY, nodeY + subtree.height);

    if (subtree.children.length > 0) {
      const childrenTotalHeight =
        subtree.children.reduce((sum, item) => sum + item.subtreeHeight, 0) +
        VERTICAL_GAP * (subtree.children.length - 1);

      let childCursorY = centerY - childrenTotalHeight / 2;
      const childX = x + subtree.width + HORIZONTAL_GAP;

      for (const childSub of subtree.children) {
        const placedChild = place(childSub, childX, childCursorY);
        childCursorY += childSub.subtreeHeight + VERTICAL_GAP;

        const startX = placed.x + placed.width;
        const startY = placed.y + placed.height / 2;
        const endX = placedChild.x;
        const endY = placedChild.y + placedChild.height / 2;

        const dx = Math.max(28, (endX - startX) * 0.52);
        const path = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

        edges.push({
          id: `${placed.id}->${placedChild.id}`,
          fromId: placed.id,
          toId: placedChild.id,
          depth: placed.depth,
          path,
          stroke: getNodePalette(placed.depth).edge,
        });
      }
    }

    return placed;
  }

  place(measured, PADDING_X, PADDING_Y);

  return {
    nodes,
    edges,
    width: Math.max(900, maxX + PADDING_X + 80),
    height: Math.max(540, maxY + PADDING_Y + 80),
  };
}
