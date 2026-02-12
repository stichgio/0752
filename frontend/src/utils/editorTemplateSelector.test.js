import { describe, expect, it } from 'vitest';

import {
    normalizeEditorTemplate,
    selectEditorTemplatesForDropdown,
} from './editorTemplateSelector';

describe('editor template selector', () => {
    it('shows only published when db has mixed draft/published', () => {
        const dbTemplates = [
            normalizeEditorTemplate({ id: 't1', name: 'Draft A', status: 'draft' }),
            normalizeEditorTemplate({ id: 't2', name: 'Publicado B', status: 'published' }),
            normalizeEditorTemplate({ id: 't3', name: 'Draft C', status: 'draft' }),
        ];

        const selected = selectEditorTemplatesForDropdown(dbTemplates, []);
        expect(selected).toHaveLength(1);
        expect(selected[0].id).toBe('t2');
        expect(selected[0].status).toBe('published');
    });

    it('does not show drafts when no published exists', () => {
        const dbTemplates = [
            normalizeEditorTemplate({ id: 'd1', name: 'Solo Draft 1', status: 'draft' }),
            normalizeEditorTemplate({ id: 'd2', name: 'Solo Draft 2', status: 'draft' }),
        ];

        const selected = selectEditorTemplatesForDropdown(dbTemplates, []);
        expect(selected).toHaveLength(0);
    });

    it('keeps legacy fallback published templates when db has no published', () => {
        const dbTemplates = [
            normalizeEditorTemplate({ id: 'd1', name: 'Solo Draft', status: 'draft' }),
        ];
        const legacyTemplates = [
            normalizeEditorTemplate({ id: 'p1', name: 'Legacy Publicada', status: 'published' }),
            normalizeEditorTemplate({ id: 'd2', name: 'Legacy Draft', status: 'draft' }),
        ];

        const selected = selectEditorTemplatesForDropdown(dbTemplates, legacyTemplates);
        expect(selected).toHaveLength(1);
        expect(selected[0]).toMatchObject({ id: 'p1', name: 'Legacy Publicada', status: 'published' });
    });
});

