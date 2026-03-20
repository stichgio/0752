export type PanelPhotoLayoutVariant = 'default' | 'three';

export function getPanelPhotoLayoutVariant(imageCount: number): PanelPhotoLayoutVariant {
  return imageCount === 3 ? 'three' : 'default';
}
