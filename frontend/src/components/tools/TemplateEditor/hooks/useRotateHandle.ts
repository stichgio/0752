import { useState, useCallback } from 'react';
import { TemplateElement } from '../canvasTypes';

export function useRotateHandle(
    scale: number,
    onUpdateElement: (id: string, updates: Partial<TemplateElement>) => void
) {
    const [isRotating, setIsRotating] = useState(false);
    const [elementId, setElementId] = useState<string | null>(null);
    const [center, setCenter] = useState({ x: 0, y: 0 });
    const [startAngle, setStartAngle] = useState(0);
    const [initialRotation, setInitialRotation] = useState(0);

    const startRotate = useCallback((e: React.MouseEvent, element: TemplateElement) => {
        e.stopPropagation();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        // Approximate center based on click for now, or calculate using element pos + width/2
        // Better: pass the element center in screen coords

        // We need element center in screen coordinates. 
        // This is hard to get efficiently without passing refs.
        // For now, let's assume the rotate handle is above the element center.
        // We can calculate angle from the mouse position relative to the element center.

        // Simplification: We set IsRotating true and capture simple state.
        // In update, we calculate angle.

        setIsRotating(true);
        setElementId(element.id);
        setInitialRotation(element.rotation || 0);

        // We need the center of the element in client coordinates.
        // We can try to find the element in DOM or pass it.
        // Hack: use the event target's parent (the element wrapper)
        const elWrapper = (e.target as HTMLElement).closest('[data-element-id]');
        if (elWrapper) {
            const box = elWrapper.getBoundingClientRect();
            const cx = box.left + box.width / 2;
            const cy = box.top + box.height / 2;
            setCenter({ x: cx, y: cy });

            const dx = e.clientX - cx;
            const dy = e.clientY - cy;
            setStartAngle(Math.atan2(dy, dx));
        }
    }, []);

    const updateRotate = useCallback((e: MouseEvent) => {
        if (!isRotating || !elementId) return;

        const dx = e.clientX - center.x;
        const dy = e.clientY - center.y;
        const angle = Math.atan2(dy, dx);
        const delta = angle - startAngle;

        const deg = delta * (180 / Math.PI);
        let newRotation = (initialRotation + deg) % 360;

        // Shift key snap
        if (e.shiftKey) {
            newRotation = Math.round(newRotation / 15) * 15;
        }

        onUpdateElement(elementId, { rotation: newRotation });

    }, [isRotating, elementId, center, startAngle, initialRotation, onUpdateElement]);

    const endRotate = useCallback(() => {
        setIsRotating(false);
        setElementId(null);
    }, []);

    return {
        isRotating,
        rotateStart: startRotate,
        rotateUpdate: updateRotate,
        rotateEnd: endRotate
    };
}
