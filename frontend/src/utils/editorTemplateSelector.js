export const TEMPLATE_STATUS_PRIORITY = { published: 0, draft: 1, archived: 2 };

export const normalizeTemplateStatus = (status) => {
    const normalized = String(status || 'draft').toLowerCase();
    return TEMPLATE_STATUS_PRIORITY[normalized] !== undefined ? normalized : 'draft';
};

export const normalizeEditorTemplate = (template, fallbackStatus = 'draft') => ({
    id: String(template?.id || ''),
    name: String(template?.name || '').trim(),
    status: normalizeTemplateStatus(template?.status || fallbackStatus),
});

export const sortEditorTemplates = (templates) => (
    [...templates].sort((a, b) => {
        const rankA = TEMPLATE_STATUS_PRIORITY[normalizeTemplateStatus(a.status)];
        const rankB = TEMPLATE_STATUS_PRIORITY[normalizeTemplateStatus(b.status)];
        if (rankA !== rankB) return rankA - rankB;
        return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    })
);

export const keepPublishedEditorTemplates = (templates) => (
    (Array.isArray(templates) ? templates : []).filter(
        (template) => normalizeTemplateStatus(template?.status) === 'published'
    )
);

export const selectEditorTemplatesForDropdown = (dbTemplates, legacyTemplates) => {
    const publishedDb = keepPublishedEditorTemplates(dbTemplates);
    if (publishedDb.length > 0) {
        return sortEditorTemplates(publishedDb);
    }
    return sortEditorTemplates(keepPublishedEditorTemplates(legacyTemplates));
};

