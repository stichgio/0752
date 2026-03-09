import { describe, it, expect } from 'vitest';
import { getElementDisplayName } from './LayersPanel';
import type { TemplateElement } from '../canvasTypes';

function makeElement(overrides: Partial<TemplateElement> = {}): TemplateElement {
    return {
        id: 'el_test',
        type: 'text',
        name: '',
        position: { x: 0, y: 0 },
        size: { width: 60, height: 10 },
        style: { zIndex: 1 },
        ...overrides,
    };
}

describe('getElementDisplayName', () => {
    it('returns custom name when element.name is set', () => {
        const el = makeElement({ name: 'Mi Título' });
        expect(getElementDisplayName(el, 0)).toBe('Mi Título');
    });

    it('returns custom name when element.name has surrounding whitespace (trimmed check)', () => {
        const el = makeElement({ name: '  Encabezado  ' });
        expect(getElementDisplayName(el, 2)).toBe('  Encabezado  ');
    });

    it('returns placeholder when name is empty string', () => {
        const el = makeElement({ type: 'text', name: '' });
        expect(getElementDisplayName(el, 0)).toBe('Texto 1');
    });

    it('returns placeholder when name is undefined', () => {
        const el = makeElement({ type: 'heading', name: undefined as unknown as string });
        expect(getElementDisplayName(el, 3)).toBe('Título 4');
    });

    it('returns placeholder when name is whitespace only', () => {
        const el = makeElement({ type: 'image', name: '   ' });
        expect(getElementDisplayName(el, 1)).toBe('Imagen 2');
    });

    it('uses correct label for each known type', () => {
        const cases: Array<[TemplateElement['type'], string]> = [
            ['text', 'Texto'],
            ['heading', 'Título'],
            ['variable', 'Variable'],
            ['image', 'Imagen'],
            ['logo', 'Logo'],
            ['table', 'Tabla'],
            ['rectangle', 'Rectángulo'],
            ['circle', 'Círculo'],
            ['line', 'Línea'],
            ['shape', 'Forma'],
            ['divider', 'Divisor'],
            ['qr', 'QR'],
            ['photo-grid', 'Cuadrícula'],
            ['signature', 'Firma'],
            ['container', 'Contenedor'],
            ['group', 'Grupo'],
        ];
        cases.forEach(([type, expectedLabel]) => {
            const el = makeElement({ type, name: '' });
            expect(getElementDisplayName(el, 0)).toBe(`${expectedLabel} 1`);
        });
    });

    it('falls back to element type for unknown type', () => {
        const el = makeElement({ type: 'unknown-type' as TemplateElement['type'], name: '' });
        expect(getElementDisplayName(el, 4)).toBe('unknown-type 5');
    });

    it('index is 1-based in the display label', () => {
        const el = makeElement({ type: 'text', name: '' });
        expect(getElementDisplayName(el, 0)).toBe('Texto 1');
        expect(getElementDisplayName(el, 9)).toBe('Texto 10');
    });
});
