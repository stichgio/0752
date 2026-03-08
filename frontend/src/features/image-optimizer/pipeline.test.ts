import { describe, expect, it } from 'vitest';
import { DEFAULT_BATCH_SETTINGS, cloneBatchSettings } from './presets';
import { ImageItem } from './types';
import { computeResizeDimensions, createImageOverrides, getProcessingPlan, resolveSettingsForItem } from './utils';

function createItem(overrides: Partial<ImageItem> = {}): ImageItem {
    return {
        id: overrides.id || 'item-1',
        sourceFile: overrides.sourceFile || new File(['demo'], overrides.originalName || 'foto.jpg', { type: 'image/jpeg' }),
        preview: overrides.preview || 'blob:demo',
        originalName: overrides.originalName || 'foto.jpg',
        originalSize: overrides.originalSize ?? 1024,
        sourceWidth: overrides.sourceWidth ?? 4000,
        sourceHeight: overrides.sourceHeight ?? 2000,
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

describe('image optimizer pipeline helpers', () => {
    it('respects width and height limits independently when resizing', () => {
        const resized = computeResizeDimensions(4000, 2000, 1000, 600, true);
        expect(resized.width).toBe(1000);
        expect(resized.height).toBe(500);
    });

    it('disables compression work when the item override skips compression', () => {
        const settings = cloneBatchSettings(DEFAULT_BATCH_SETTINGS);
        const item = createItem({ overrides: { ...createImageOverrides(), skipCompression: true } });
        const effective = resolveSettingsForItem(settings, item);
        const plan = getProcessingPlan(item, effective);

        expect(effective.operations.compressionEnabled).toBe(false);
        expect(plan.shouldCompress).toBe(false);
    });

    it('keeps rename-only workflow on the original bytes', () => {
        const settings = cloneBatchSettings(DEFAULT_BATCH_SETTINGS);
        settings.operations.cropEnabled = false;
        settings.operations.resizeEnabled = false;
        settings.operations.formatEnabled = false;
        settings.operations.compressionEnabled = false;
        settings.operations.renameEnabled = true;

        const item = createItem();
        const plan = getProcessingPlan(item, settings);

        expect(plan.usesSourceDirectly).toBe(true);
    });

    it('still plans resize when compression is off but resize remains enabled', () => {
        const settings = cloneBatchSettings(DEFAULT_BATCH_SETTINGS);
        settings.operations.formatEnabled = false;
        settings.operations.compressionEnabled = false;
        settings.resize.maxWidth = 800;
        settings.resize.maxHeight = 600;

        const item = createItem({ sourceWidth: 3000, sourceHeight: 2000 });
        const plan = getProcessingPlan(item, settings);

        expect(plan.shouldResize).toBe(true);
        expect(plan.shouldCompress).toBe(false);
        expect(plan.usesSourceDirectly).toBe(false);
    });
});
