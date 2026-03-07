import { describe, expect, it } from 'vitest';
import { DEFAULT_BATCH_SETTINGS, IMAGE_OPTIMIZER_PRESETS, cloneBatchSettings } from './presets';
import { ImageItem } from './types';
import {
    buildDownloadNameMap,
    buildItemSignature,
    createImageOverrides,
    getDownloadableItems,
    getPrimaryActionLabel,
    getStats,
    isItemDirectExport,
    syncStaleState,
} from './utils';

function createItem(overrides: Partial<ImageItem> = {}): ImageItem {
    return {
        id: overrides.id || 'item-1',
        sourceFile: overrides.sourceFile || new File(['demo'], overrides.originalName || 'foto.jpg', { type: 'image/jpeg' }),
        preview: overrides.preview || 'blob:demo',
        originalName: overrides.originalName || 'foto.jpg',
        originalSize: overrides.originalSize ?? 1024,
        sourceWidth: overrides.sourceWidth ?? 2400,
        sourceHeight: overrides.sourceHeight ?? 1600,
        status: overrides.status || 'pending',
        stale: overrides.stale ?? false,
        selected: overrides.selected ?? false,
        excluded: overrides.excluded ?? false,
        overrides: overrides.overrides || createImageOverrides(),
        resultBlob: overrides.resultBlob,
        resultPreview: overrides.resultPreview,
        resultSize: overrides.resultSize,
        finalWidth: overrides.finalWidth,
        finalHeight: overrides.finalHeight,
        error: overrides.error,
        processedSignature: overrides.processedSignature,
        processedAt: overrides.processedAt,
    };
}

describe('image optimizer utils', () => {
    it('dedupes custom names while preserving the target extension', () => {
        const settings = cloneBatchSettings(DEFAULT_BATCH_SETTINGS);
        const items = [
            createItem({ id: 'a', originalName: 'uno.png', overrides: { ...createImageOverrides(), customFilename: 'hero' } }),
            createItem({ id: 'b', originalName: 'dos.png', overrides: { ...createImageOverrides(), customFilename: 'hero' } }),
        ];

        const names = buildDownloadNameMap(items, settings);
        expect(names.get('a')).toBe('hero.jpg');
        expect(names.get('b')).toBe('hero-2.jpg');
    });

    it('returns direct-download CTA for rename-only preset', () => {
        const settings = cloneBatchSettings(IMAGE_OPTIMIZER_PRESETS.find((preset) => preset.id === 'rename-only')!.settings);
        const items = [createItem()];

        expect(isItemDirectExport(items[0], settings)).toBe(true);
        expect(getPrimaryActionLabel(items, settings)).toBe('Descargar renombradas');
        expect(getDownloadableItems(items, settings)).toHaveLength(1);
    });

    it('marks completed items as stale when a content setting changes', () => {
        const settings = cloneBatchSettings(DEFAULT_BATCH_SETTINGS);
        const item = createItem({
            status: 'completed',
            resultBlob: new Blob(['done'], { type: 'image/jpeg' }),
            resultSize: 800,
        });
        item.processedSignature = buildItemSignature(item, settings);

        const nextSettings = cloneBatchSettings(settings);
        nextSettings.compression.quality = 0.45;

        const synced = syncStaleState([item], nextSettings);
        expect(synced[0].stale).toBe(true);
    });

    it('excludes flagged items from aggregate stats', () => {
        const settings = cloneBatchSettings(DEFAULT_BATCH_SETTINGS);
        const items = [
            createItem({ id: 'one', originalSize: 1000, resultSize: 600, resultBlob: new Blob(['x']), status: 'completed' }),
            createItem({ id: 'two', excluded: true, overrides: { ...createImageOverrides(), excluded: true }, originalSize: 5000 }),
        ];

        const stats = getStats(items, settings);
        expect(stats.includedCount).toBe(1);
        expect(stats.totalOriginalSize).toBe(1000);
    });
});
