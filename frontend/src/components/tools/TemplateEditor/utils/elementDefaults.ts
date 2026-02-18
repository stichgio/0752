import { Position, Size, TemplateElement, ElementType, DEFAULT_TOOLS, generateId } from '../canvasTypes';

// Default dimensions in mm
export const ELEMENT_DEFAULTS: Record<string, Partial<TemplateElement>> = {
    header: { size: { width: 203, height: 16 }, style: { zIndex: 1 } }, // 770px approx
    'info-bar': { size: { width: 203, height: 10 }, style: { zIndex: 1 } },
    'section-title': { size: { width: 203, height: 8 }, style: { zIndex: 1 } },
    'data-grid': { size: { width: 203, height: 21 }, style: { zIndex: 1 } },
    'photo-grid': { size: { width: 203, height: 53 }, style: { zIndex: 1 } },
    text: { size: { width: 98, height: 16 }, style: { zIndex: 1 } },
    table: { size: { width: 203, height: 32 }, style: { zIndex: 1 } },
    signature: { size: { width: 203, height: 21 }, style: { zIndex: 1 } },
    footer: { size: { width: 203, height: 8 }, style: { zIndex: 1 } },
    spacer: { size: { width: 203, height: 5 }, style: { zIndex: 1 } },
    shape: { size: { width: 50, height: 50 }, style: { zIndex: 1 } },
    divider: { size: { width: 203, height: 2 }, style: { zIndex: 1 } },
    qr: { size: { width: 26, height: 26 }, style: { zIndex: 1 } },
};

// Full width elements that should stack vertically
export const FLOW_ELEMENTS = [
    'header', 'info-bar', 'section-title', 'data-grid',
    'photo-grid', 'table', 'signature', 'footer'
];

export function getDefaultElementConfig(type: string): Partial<TemplateElement> {
    return ELEMENT_DEFAULTS[type] || { size: { width: 50, height: 50 } };
}

/**
 * Migrates a document to ensure all elements have valid transforms/positions.
 * If elements lack position, it stacks them vertically (legacy import behavior).
 */
export function migrateToCanvas(elements: TemplateElement[]): TemplateElement[] {
    let currentY = 10; // Start margin

    return elements.map((el, index) => {
        // If element already has position, keep it (unless it's 0,0 which implies uninitialized)
        if (el.position && (el.position.x !== 0 || el.position.y !== 0)) {
            return el;
        }

        const isFlow = FLOW_ELEMENTS.includes(el.type);
        const defaults = getDefaultElementConfig(el.type);

        const width = el.size?.width || defaults.size?.width || 200;
        const height = el.size?.height || defaults.size?.height || 50;

        // Position logic for migration:
        // Flow elements: x=margin, y=stack
        // Others: center or stack? Prompt says "insert centered" for new ones, 
        // but migration usually implies legacy structure which was vertical stack.
        // We'll stack everything for safety in legacy migration.

        const x = 5; // Left margin 5mm
        const y = currentY;

        currentY += height + 5; // Gap 5mm

        return {
            ...el,
            position: { x, y },
            size: { width, height },
            rotation: el.rotation || 0,
            style: { ...el.style, zIndex: el.style.zIndex || index + 1 }
        };
    });
}
