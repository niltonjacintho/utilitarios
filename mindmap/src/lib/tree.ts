import { MindMapNode } from '../types/mindmap';

export function createId(prefix = 'n'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function findNode(root: MindMapNode, id: string): MindMapNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function findParent(
  root: MindMapNode,
  targetId: string,
): MindMapNode | null {
  for (const child of root.children) {
    if (child.id === targetId) return root;
    const found = findParent(child, targetId);
    if (found) return found;
  }
  return null;
}

export function updateNode(
  root: MindMapNode,
  id: string,
  updater: (node: MindMapNode) => MindMapNode,
): MindMapNode {
  if (root.id === id) {
    return updater(root);
  }
  return {
    ...root,
    children: root.children.map((child) => updateNode(child, id, updater)),
  };
}

export function addChildNode(
  root: MindMapNode,
  parentId: string,
  text = 'Novo item',
): { root: MindMapNode; created: MindMapNode } {
  const created: MindMapNode = {
    id: createId('node'),
    text,
    completed: false,
    comments: [],
    children: [],
  };

  const nextRoot = updateNode(root, parentId, (node) => ({
    ...node,
    collapsed: false,
    children: [...node.children, created],
  }));

  return { root: nextRoot, created };
}

export function addSiblingNode(
  root: MindMapNode,
  nodeId: string,
  text = 'Novo item',
): { root: MindMapNode; created: MindMapNode } {
  const parent = findParent(root, nodeId);
  if (!parent) {
    return addChildNode(root, root.id, text);
  }

  const created: MindMapNode = {
    id: createId('node'),
    text,
    completed: false,
    comments: [],
    children: [],
  };

  const nextRoot = updateNode(root, parent.id, (p) => {
    const idx = p.children.findIndex((c) => c.id === nodeId);
    const nextChildren = [...p.children];
    nextChildren.splice(idx + 1, 0, created);
    return { ...p, children: nextChildren };
  });

  return { root: nextRoot, created };
}

export function deleteNode(
  root: MindMapNode,
  nodeId: string,
): { root: MindMapNode; fallbackId: string | null } {
  if (root.id === nodeId) {
    return { root, fallbackId: root.id };
  }

  const parent = findParent(root, nodeId);
  if (!parent) {
    return { root, fallbackId: null };
  }

  const idx = parent.children.findIndex((c) => c.id === nodeId);
  const nextSibling =
    parent.children[idx + 1]?.id ?? parent.children[idx - 1]?.id ?? parent.id;

  const nextRoot = updateNode(root, parent.id, (p) => ({
    ...p,
    children: p.children.filter((c) => c.id !== nodeId),
  }));

  return { root: nextRoot, fallbackId: nextSibling };
}

export function setAllCollapsed(
  root: MindMapNode,
  collapsed: boolean,
  isRoot = true,
): MindMapNode {
  return {
    ...root,
    collapsed: isRoot ? false : root.children.length > 0 ? collapsed : false,
    children: root.children.map((child) =>
      setAllCollapsed(child, collapsed, false),
    ),
  };
}

export function countNodes(node: MindMapNode): number {
  return (
    1 + node.children.reduce((total, child) => total + countNodes(child), 0)
  );
}

export function countCompleted(node: MindMapNode): number {
  return (
    (node.completed ? 1 : 0) +
    node.children.reduce((total, child) => total + countCompleted(child), 0)
  );
}

export function getAdjacentNodeId(
  root: MindMapNode,
  currentId: string,
  direction: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
): string | null {
  const current = findNode(root, currentId);
  if (!current) return root.id;

  if (direction === 'ArrowRight') {
    if (!current.collapsed && current.children.length > 0) {
      return current.children[0].id;
    }
    return null;
  }

  const parent = findParent(root, currentId);
  if (!parent) return null;

  if (direction === 'ArrowLeft') {
    return parent.id;
  }

  const idx = parent.children.findIndex((c) => c.id === currentId);
  if (direction === 'ArrowUp' && idx > 0) {
    return parent.children[idx - 1].id;
  }
  if (direction === 'ArrowDown' && idx < parent.children.length - 1) {
    return parent.children[idx + 1].id;
  }
  return null;
}

export function treeToMarkdown(node: MindMapNode, depth = 0): string {
  if (depth === 0) {
    const lines = [`# ${node.text}`];
    if (node.notes?.trim()) {
      lines.push(`> ${node.notes.trim().replace(/\n/g, '\n> ')}`);
    }
    lines.push('');
    for (const child of node.children) {
      lines.push(treeToMarkdown(child, 1));
    }
    return lines.join('\n').trim() + '\n';
  }

  const indent = '  '.repeat(depth - 1);
  const checkbox = node.completed ? '[x] ' : '';
  const lines = [`${indent}- ${checkbox}${node.text}`];
  for (const child of node.children) {
    lines.push(treeToMarkdown(child, depth + 1));
  }
  return lines.join('\n');
}

export function markdownToTree(
  markdown: string,
  fallbackTitle: string,
): MindMapNode {
  const rawLines = markdown
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, '  '));

  let rootTitle = fallbackTitle;
  const root: MindMapNode = {
    id: createId('root'),
    text: rootTitle,
    completed: false,
    comments: [],
    children: [],
  };

  const stack: Array<{ depth: number; node: MindMapNode }> = [
    { depth: -1, node: root },
  ];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('# ')) {
      rootTitle = trimmed.slice(2).trim() || fallbackTitle;
      root.text = rootTitle;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const noteLine = trimmed.slice(2).trim();
      const top = stack[stack.length - 1]?.node ?? root;
      top.notes = top.notes ? `${top.notes}\n${noteLine}` : noteLine;
      continue;
    }

    const bulletMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (!bulletMatch) continue;

    const spaces = bulletMatch[1].length;
    const depth = Math.floor(spaces / 2);
    let content = bulletMatch[2].trim();
    let completed = false;

    if (/^\[x\]\s+/i.test(content)) {
      completed = true;
      content = content.replace(/^\[x\]\s+/i, '').trim();
    } else if (/^\[\s\]\s+/.test(content)) {
      content = content.replace(/^\[\s\]\s+/, '').trim();
    }

    if (!content) continue;

    const nextNode: MindMapNode = {
      id: createId('node'),
      text: content,
      completed,
      comments: [],
      children: [],
    };

    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    stack[stack.length - 1].node.children.push(nextNode);
    stack.push({ depth, node: nextNode });
  }

  return root;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
