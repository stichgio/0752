import type { PageSettings, Position, Size, TemplateElement } from '../canvasTypes';

export const DEFAULT_SMART_SNAP_THRESHOLD_MM = 2.5;

export type SnapAxis = 'x' | 'y';

export interface SnapGuide {
  axis: SnapAxis;
  position: number;
}

export interface SnapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ElementLineCache {
  id: string;
  x: [number, number, number];
  y: [number, number, number];
}

export interface DocumentSnapLines {
  pageX: number[];
  pageY: number[];
  elementLines: ElementLineCache[];
}

export interface CollectedSnapLines {
  x: number[];
  y: number[];
}

export interface SnapResult {
  x?: number;
  y?: number;
  guides: SnapGuide[];
}

export interface SnapComputation {
  x: number;
  y: number;
  guides: SnapGuide[];
  snappedX: boolean;
  snappedY: boolean;
}

interface AxisSnapCandidate {
  distance: number;
  guide: number;
  snappedValue: number;
}

interface AxisSnapMatch {
  value: number;
  distance: number;
}

function buildElementLineCache(element: TemplateElement): ElementLineCache {
  const left = element.position.x;
  const right = left + element.size.width;
  const top = element.position.y;
  const bottom = top + element.size.height;

  return {
    id: element.id,
    x: [left, left + element.size.width / 2, right],
    y: [top, top + element.size.height / 2, bottom],
  };
}

function pickNearestCandidate(candidates: Array<AxisSnapCandidate | null>): AxisSnapCandidate | null {
  let best: AxisSnapCandidate | null = null;

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!best || candidate.distance < best.distance) {
      best = candidate;
    }
  }

  return best;
}

function toCandidate(match: AxisSnapMatch | null, snappedValue: number): AxisSnapCandidate | null {
  if (!match) return null;
  return {
    distance: match.distance,
    guide: match.value,
    snappedValue,
  };
}

export function buildDocumentSnapLines(
  elements: TemplateElement[],
  pageSettings: PageSettings,
): DocumentSnapLines {
  const marginLeft = pageSettings.margins?.left ?? 0;
  const marginRight = pageSettings.margins?.right ?? 0;
  const marginTop = pageSettings.margins?.top ?? 0;
  const marginBottom = pageSettings.margins?.bottom ?? 0;

  // Add new page-level or element-level reference sources here.
  return {
    pageX: [
      0,
      marginLeft,
      pageSettings.width / 2,
      pageSettings.width - marginRight,
      pageSettings.width,
    ],
    pageY: [
      0,
      marginTop,
      pageSettings.height / 2,
      pageSettings.height - marginBottom,
      pageSettings.height,
    ],
    // Hidden elements stay out of the reference model to avoid snapping to objects
    // the user cannot see.
    elementLines: elements
      .filter((element) => element.visible !== false)
      .map((element) => buildElementLineCache(element)),
  };
}

export function collectSnapLines(
  source: DocumentSnapLines,
  excludedIds?: ReadonlySet<string> | readonly string[] | string,
): CollectedSnapLines {
  const x = source.pageX.slice();
  const y = source.pageY.slice();

  for (const entry of source.elementLines) {
    if (
      excludedIds &&
      (
        (typeof excludedIds === 'string' && excludedIds === entry.id) ||
        (Array.isArray(excludedIds) && excludedIds.includes(entry.id)) ||
        (!Array.isArray(excludedIds) && typeof excludedIds !== 'string' && excludedIds.has(entry.id))
      )
    ) {
      continue;
    }
    x.push(entry.x[0], entry.x[1], entry.x[2]);
    y.push(entry.y[0], entry.y[1], entry.y[2]);
  }

  return { x, y };
}

export function findNearestSnapValue(
  current: number,
  references: number[],
  threshold = DEFAULT_SMART_SNAP_THRESHOLD_MM,
): AxisSnapMatch | null {
  let best: AxisSnapMatch | null = null;

  for (const reference of references) {
    const distance = Math.abs(current - reference);
    if (distance > threshold) continue;
    if (!best || distance < best.distance) {
      best = { value: reference, distance };
    }
  }

  return best;
}

export function computeSnapPosition(
  rect: SnapRect,
  lines: CollectedSnapLines,
  options: {
    threshold?: number;
    gridSize?: number;
    enableGrid?: boolean;
    enableSmartSnap?: boolean;
  } = {},
): SnapComputation {
  const threshold = options.threshold ?? DEFAULT_SMART_SNAP_THRESHOLD_MM;
  const gridSize = options.gridSize ?? 0;
  const enableGrid = options.enableGrid ?? true;
  const enableSmartSnap = options.enableSmartSnap ?? true;

  let x = rect.x;
  let y = rect.y;
  let snappedX = false;
  let snappedY = false;
  const guides: SnapGuide[] = [];

  if (enableSmartSnap) {
    const xLeft = findNearestSnapValue(rect.x, lines.x, threshold);
    const xCenter = findNearestSnapValue(rect.x + rect.width / 2, lines.x, threshold);
    const xRight = findNearestSnapValue(rect.x + rect.width, lines.x, threshold);

    const resolvedX = pickNearestCandidate([
      toCandidate(xLeft, xLeft ? xLeft.value : rect.x),
      toCandidate(xCenter, xCenter ? xCenter.value - rect.width / 2 : rect.x),
      toCandidate(xRight, xRight ? xRight.value - rect.width : rect.x),
    ]);

    if (resolvedX) {
      x = resolvedX.snappedValue;
      snappedX = true;
      guides.push({ axis: 'x', position: resolvedX.guide });
    }

    const yTop = findNearestSnapValue(rect.y, lines.y, threshold);
    const yMiddle = findNearestSnapValue(rect.y + rect.height / 2, lines.y, threshold);
    const yBottom = findNearestSnapValue(rect.y + rect.height, lines.y, threshold);

    const resolvedY = pickNearestCandidate([
      toCandidate(yTop, yTop ? yTop.value : rect.y),
      toCandidate(yMiddle, yMiddle ? yMiddle.value - rect.height / 2 : rect.y),
      toCandidate(yBottom, yBottom ? yBottom.value - rect.height : rect.y),
    ]);

    if (resolvedY) {
      y = resolvedY.snappedValue;
      snappedY = true;
      guides.push({ axis: 'y', position: resolvedY.guide });
    }
  }

  if (!snappedX && enableGrid && gridSize > 0) {
    x = Math.round(rect.x / gridSize) * gridSize;
  }

  if (!snappedY && enableGrid && gridSize > 0) {
    y = Math.round(rect.y / gridSize) * gridSize;
  }

  return {
    x,
    y,
    guides,
    snappedX,
    snappedY,
  };
}

export function calculateSnap(
  elementId: string,
  pos: Position,
  size: Size,
  elements: TemplateElement[],
  pageSettings: PageSettings,
): SnapResult {
  const excludedIds = new Set<string>([elementId]);
  const lines = collectSnapLines(buildDocumentSnapLines(elements, pageSettings), excludedIds);
  const result = computeSnapPosition(
    { x: pos.x, y: pos.y, width: size.width, height: size.height },
    lines,
    { threshold: DEFAULT_SMART_SNAP_THRESHOLD_MM, enableGrid: false },
  );

  return {
    x: result.snappedX ? result.x : undefined,
    y: result.snappedY ? result.y : undefined,
    guides: result.guides,
  };
}
