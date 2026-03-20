import { describe, expect, it } from 'vitest';

import { getPanelPhotoLayoutVariant } from './layout';

describe('panel fotografico layout', () => {
  it('uses the three-photo layout only when a page has exactly 3 images', () => {
    expect(getPanelPhotoLayoutVariant(0)).toBe('default');
    expect(getPanelPhotoLayoutVariant(1)).toBe('default');
    expect(getPanelPhotoLayoutVariant(2)).toBe('default');
    expect(getPanelPhotoLayoutVariant(3)).toBe('three');
    expect(getPanelPhotoLayoutVariant(4)).toBe('default');
  });
});
