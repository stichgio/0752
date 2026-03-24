/**
 * Barrel export para componentes comunes
 */

export { default as Step } from './Step';
export { default as LoadingModal } from './LoadingModal';
export { default as MissingApiConfigBanner } from './MissingApiConfigBanner';
export { ConfirmDialogProvider, useConfirmDialog } from './ConfirmDialogProvider';

// ── Design System v1 primitives ──
export { default as Button } from './Button';
export { default as Dialog } from './Dialog';
export { default as UploadZone } from './UploadZone';
export { default as PageHeader } from './PageHeader';
export { default as StatusBadge } from './StatusBadge';
export { default as EmptyState } from './EmptyState';
export { default as JobProgress } from './JobProgress';
export { cn } from './cn';

// ── Re-export types ──
export type { ButtonProps } from './Button';
export type { DialogProps } from './Dialog';
export type { UploadZoneProps } from './UploadZone';
export type { PageHeaderProps } from './PageHeader';
export type { StatusBadgeProps, StatusTone } from './StatusBadge';
export type { EmptyStateProps } from './EmptyState';
export type { JobProgressProps, JobState } from './JobProgress';
export type { ConfirmDialogFn, ConfirmDialogOptions, ConfirmTone } from './ConfirmDialogProvider';
