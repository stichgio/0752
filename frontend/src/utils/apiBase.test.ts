import { describe, expect, it, vi } from 'vitest';

describe('apiBase', () => {
    it('uses the Vite proxy in localhost when VITE_API_URL is not configured', async () => {
        vi.stubEnv('VITE_API_URL', '');
        vi.stubGlobal('window', {
            location: { hostname: 'localhost' },
        });

        const mod = await import('./apiBase');

        expect(mod.getApiBase()).toBe('');
        expect(mod.isApiConfigMissing()).toBe(false);
    });
});
