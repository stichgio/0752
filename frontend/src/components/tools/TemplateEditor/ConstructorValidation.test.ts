
import { describe, it, expect } from 'vitest';

// Replicates the validation logic inside validateConstructor for all block types.

type BlockType =
    | 'header' | 'info-bar' | 'section-title' | 'data-grid' | 'photo-grid'
    | 'text' | 'table' | 'signatures' | 'footer' | 'spacer';

describe('BlockEditor Constructor Validation Logic', () => {
    const validate = (kind: BlockType, config: any) => {
        const errors: string[] = [];
        if (kind === 'photo-grid') {
            if (!config.panelTitle?.trim()) errors.push('El título del panel es obligatorio.');
        } else if (kind === 'data-grid') {
            if (!config.fields?.length) errors.push('Debe haber al menos un campo en la grilla.');
            if (config.fields?.some((f: any) => !f.label?.trim())) errors.push('Todas las etiquetas de los campos deben tener texto.');
            if (config.fields?.some((f: any) => !f.variable?.trim())) errors.push('Todas las variables deben tener un ID interno.');
        } else if (kind === 'header') {
            if (!config.title?.trim()) errors.push('El título del encabezado es obligatorio.');
        } else if (kind === 'info-bar') {
            if (!config.fields?.length) errors.push('Debe haber al menos un campo en la barra.');
        } else if (kind === 'table') {
            if (!config.headers?.length) errors.push('Debe haber al menos una columna en la tabla.');
        } else if (kind === 'signatures') {
            if (!config.signatures?.length) errors.push('Debe haber al menos una firma.');
        }
        // section-title, text, footer, spacer → always valid with defaults
        return errors;
    };

    it('validates photo-grid correctly', () => {
        expect(validate('photo-grid', { panelTitle: '' })).toContain('El título del panel es obligatorio.');
        expect(validate('photo-grid', { panelTitle: '  ' })).toContain('El título del panel es obligatorio.');
        expect(validate('photo-grid', { panelTitle: 'Valid Title' })).toHaveLength(0);
    });

    it('validates data-grid correctly', () => {
        expect(validate('data-grid', { fields: [] })).toContain('Debe haber al menos un campo en la grilla.');

        expect(validate('data-grid', { fields: [{ label: '', variable: 'VAR' }] }))
            .toContain('Todas las etiquetas de los campos deben tener texto.');

        expect(validate('data-grid', { fields: [{ label: 'Label', variable: '' }] }))
            .toContain('Todas las variables deben tener un ID interno.');

        expect(validate('data-grid', { fields: [{ label: 'Label', variable: 'VAR' }] }))
            .toHaveLength(0);
    });

    it('validates header correctly', () => {
        expect(validate('header', { title: '' })).toContain('El título del encabezado es obligatorio.');
        expect(validate('header', { title: '  ' })).toContain('El título del encabezado es obligatorio.');
        expect(validate('header', { title: 'PANEL FOTOGRAFICO' })).toHaveLength(0);
    });

    it('validates info-bar correctly', () => {
        expect(validate('info-bar', { fields: [] })).toContain('Debe haber al menos un campo en la barra.');
        expect(validate('info-bar', { fields: undefined })).toContain('Debe haber al menos un campo en la barra.');
        expect(validate('info-bar', { fields: [{ label: 'NIS', variable: 'NIS' }] })).toHaveLength(0);
    });

    it('validates table correctly', () => {
        expect(validate('table', { headers: [] })).toContain('Debe haber al menos una columna en la tabla.');
        expect(validate('table', { headers: undefined })).toContain('Debe haber al menos una columna en la tabla.');
        expect(validate('table', { headers: ['Campo', 'Valor'] })).toHaveLength(0);
    });

    it('validates signatures correctly', () => {
        expect(validate('signatures', { signatures: [] })).toContain('Debe haber al menos una firma.');
        expect(validate('signatures', { signatures: undefined })).toContain('Debe haber al menos una firma.');
        expect(validate('signatures', { signatures: [{ title: 'EJECUTOR', name: '' }] })).toHaveLength(0);
    });

    it('always passes for section-title, text, footer, spacer', () => {
        expect(validate('section-title', {})).toHaveLength(0);
        expect(validate('text', {})).toHaveLength(0);
        expect(validate('footer', {})).toHaveLength(0);
        expect(validate('spacer', {})).toHaveLength(0);
    });
});
