// Basic stub for API client interaction
// This mocks the endpoints required by the prompt
export const templateEditorApi = {
    create: async (data: any) => { /* ... */ },
    update: async (id: string, data: any) => { /* ... */ },
    publish: async (id: string) => { /* ... */ },
    preview: async (id: string) => { /* ... */ },
    delete: async (id: string) => { /* ... */ },
    list: async () => { return []; },
    getTemplateRaw: async (id: string) => { return null; },
    getPublished: async () => { return []; },
    getVariables: async () => { return []; },
};
