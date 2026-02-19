import { useMemo } from 'react';
import { PageSettings, Position, TemplateElement } from '../canvasTypes';

export type GuideAxis = 'x' | 'y';

export interface Guide {
    axis: GuideAxis;
    position: number;
    active: boolean;
}

const SMART_GUIDE_THRESHOLD_MM = 1.5;

function dedupeAndSort(values: number[]): number[] {
    const set = new Set<number>();
    values.forEach((value) => {
        set.add(Number(value.toFixed(4)));
    });
    return Array.from(set).sort((a, b) => a - b);
}

function getElementAxes(position: Position, size: { width: number; height: number }) {
    return {
        x: [position.x, position.x + size.width, position.x + size.width / 2],
        y: [position.y, position.y + size.height, position.y + size.height / 2],
    };
}

function resolveAxisSnap(
    guidePositions: number[],
    candidatesPerGuide: (guidePosition: number) => Array<{ distance: number; snappedPosition: number }>,
): number | undefined {
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestPosition: number | undefined;

    guidePositions.forEach((guidePosition) => {
        const candidates = candidatesPerGuide(guidePosition);
        candidates.forEach((candidate) => {
            if (candidate.distance > SMART_GUIDE_THRESHOLD_MM) return;
            if (candidate.distance >= bestDistance) return;
            bestDistance = candidate.distance;
            bestPosition = candidate.snappedPosition;
        });
    });

    return bestPosition;
}

export function computeSmartGuides(
    elements: TemplateElement[],
    draggingId: string | null,
    draggingPosition: Position,
    pageSettings: PageSettings,
): Guide[] {
    if (!draggingId) return [];

    const draggingElement = elements.find((element) => element.id === draggingId);
    if (!draggingElement) return [];

    const pageXAxis = [0, pageSettings.width / 2, pageSettings.width];
    const pageYAxis = [0, pageSettings.height / 2, pageSettings.height];

    const elementXAxis: number[] = [];
    const elementYAxis: number[] = [];

    elements.forEach((element) => {
        if (element.id === draggingId || element.visible === false) return;
        const axes = getElementAxes(element.position, element.size);
        elementXAxis.push(...axes.x);
        elementYAxis.push(...axes.y);
    });

    const xReferences = dedupeAndSort([...pageXAxis, ...elementXAxis]);
    const yReferences = dedupeAndSort([...pageYAxis, ...elementYAxis]);

    const draggingAxes = getElementAxes(draggingPosition, draggingElement.size);

    const xGuides: Guide[] = xReferences.map((position) => ({
        axis: 'x',
        position,
        active: draggingAxes.x.some((axisValue) => Math.abs(axisValue - position) <= SMART_GUIDE_THRESHOLD_MM),
    }));

    const yGuides: Guide[] = yReferences.map((position) => ({
        axis: 'y',
        position,
        active: draggingAxes.y.some((axisValue) => Math.abs(axisValue - position) <= SMART_GUIDE_THRESHOLD_MM),
    }));

    return [...xGuides, ...yGuides];
}

export function resolveSmartGuideSnap(
    elements: TemplateElement[],
    draggingId: string | null,
    draggingPosition: Position,
    pageSettings: PageSettings,
): { x?: number; y?: number; guides: Guide[] } {
    const guides = computeSmartGuides(elements, draggingId, draggingPosition, pageSettings);
    if (!draggingId) return { guides };

    const draggingElement = elements.find((element) => element.id === draggingId);
    if (!draggingElement) return { guides };

    const width = draggingElement.size.width;
    const height = draggingElement.size.height;

    const activeX = guides
        .filter((guide) => guide.axis === 'x' && guide.active)
        .map((guide) => guide.position);
    const activeY = guides
        .filter((guide) => guide.axis === 'y' && guide.active)
        .map((guide) => guide.position);

    const x = resolveAxisSnap(activeX, (guidePosition) => [
        {
            distance: Math.abs(draggingPosition.x - guidePosition),
            snappedPosition: guidePosition,
        },
        {
            distance: Math.abs(draggingPosition.x + width - guidePosition),
            snappedPosition: guidePosition - width,
        },
        {
            distance: Math.abs(draggingPosition.x + width / 2 - guidePosition),
            snappedPosition: guidePosition - width / 2,
        },
    ]);

    const y = resolveAxisSnap(activeY, (guidePosition) => [
        {
            distance: Math.abs(draggingPosition.y - guidePosition),
            snappedPosition: guidePosition,
        },
        {
            distance: Math.abs(draggingPosition.y + height - guidePosition),
            snappedPosition: guidePosition - height,
        },
        {
            distance: Math.abs(draggingPosition.y + height / 2 - guidePosition),
            snappedPosition: guidePosition - height / 2,
        },
    ]);

    return { x, y, guides };
}

export function useSmartGuides(
    elements: TemplateElement[],
    draggingId: string | null,
    draggingPosition: Position,
    pageSettings: PageSettings,
) {
    const guides = useMemo(
        () => computeSmartGuides(elements, draggingId, draggingPosition, pageSettings),
        [elements, draggingId, draggingPosition.x, draggingPosition.y, pageSettings],
    );

    return { guides };
}
