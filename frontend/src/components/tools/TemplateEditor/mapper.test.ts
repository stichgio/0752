import { describe, expect, it } from 'vitest';

import { documentToLegacyTemplate, legacyTemplateToDocument } from './mapper';

describe('template mapper', () => {
  it('maps document to legacy template json', () => {
    const document = {
      id: 'doc1',
      name: 'Plantilla',
      reportType: 'technical_report' as const,
      page: { size: 'A4' as const, orientation: 'portrait' as const, marginMm: 10 },
      elements: [
        {
          id: 'v1',
          type: 'variable' as const,
          x: 10,
          y: 10,
          width: 80,
          height: 20,
          zIndex: 1,
          token: '{{cs}}',
        },
      ],
      version: 1,
      status: 'draft' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const legacy = documentToLegacyTemplate(document);
    expect(legacy.sections).toHaveLength(1);
    expect(legacy.sections[0].blocks[0].content).toBe('{{cs}}');
  });

  it('maps legacy to document', () => {
    const doc = legacyTemplateToDocument(
      {
        reportType: 'technical-report',
        sections: [{ id: 's1', type: 'body', title: 'Body', blocks: [{ id: 'b1', type: 'text', content: 'hola' }] }],
      },
      'tpl-1',
      'Demo'
    );

    expect(doc.id).toBe('tpl-1');
    expect(doc.elements[0].type).toBe('text');
  });
});
