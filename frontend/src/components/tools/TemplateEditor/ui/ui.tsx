import React from 'react';

function cx(...parts: Array<string | undefined | null | false>): string {
    return parts.filter(Boolean).join(' ');
}

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Panel({ className, ...props }: PanelProps) {
    return (
        <div
            className={cx(
                'h-full overflow-y-auto p-3 space-y-4',
                className,
            )}
            {...props}
        />
    );
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className, ...props }: CardProps) {
    return (
        <div
            className={cx(
                'rounded-lg border border-neutral-200 bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]',
                className,
            )}
            {...props}
        />
    );
}

export interface SectionTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export function SectionTitle({ className, ...props }: SectionTitleProps) {
    return (
        <h3
            className={cx(
                'text-xs font-semibold uppercase tracking-wide text-neutral-500',
                className,
            )}
            {...props}
        />
    );
}

export interface FieldLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export function FieldLabel({ className, ...props }: FieldLabelProps) {
    return (
        <label
            className={cx(
                'mb-1 block text-xs font-medium text-neutral-700',
                className,
            )}
            {...props}
        />
    );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
    { className, type = 'text', ...props },
    ref,
) {
    if (type === 'checkbox') {
        return (
            <input
                ref={ref}
                type={type}
                className={cx(
                    'h-4 w-4 rounded border border-neutral-300 text-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:cursor-not-allowed disabled:opacity-60',
                    className,
                )}
                {...props}
            />
        );
    }

    return (
        <input
            ref={ref}
            type={type}
            className={cx(
                'h-9 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500',
                className,
            )}
            {...props}
        />
    );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
    { className, ...props },
    ref,
) {
    return (
        <select
            ref={ref}
            className={cx(
                'h-9 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500',
                className,
            )}
            {...props}
        />
    );
});

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
    primary:
        'bg-violet-600 text-white hover:bg-violet-700 focus:ring-violet-500/30 disabled:bg-violet-400',
    secondary:
        'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 focus:ring-neutral-500/20 disabled:bg-neutral-100',
    danger:
        'border border-red-200 bg-white text-red-700 hover:bg-red-50 focus:ring-red-500/20 disabled:bg-red-100 disabled:text-red-400',
    ghost:
        'text-neutral-600 hover:bg-neutral-100 focus:ring-neutral-500/20 disabled:text-neutral-400',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
    sm: 'h-7 px-2 text-xs',
    md: 'h-9 px-3 text-sm',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
}

export function Button({
    className,
    variant = 'primary',
    size = 'md',
    type = 'button',
    ...props
}: ButtonProps) {
    return (
        <button
            type={type}
            className={cx(
                'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 disabled:pointer-events-none disabled:opacity-60',
                BUTTON_VARIANTS[variant],
                BUTTON_SIZES[size],
                className,
            )}
            {...props}
        />
    );
}

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const BADGE_TONES: Record<BadgeTone, string> = {
    neutral: 'border-neutral-200 bg-neutral-100 text-neutral-700',
    info: 'border-blue-200 bg-blue-50 text-blue-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-red-200 bg-red-50 text-red-700',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    tone?: BadgeTone;
}

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
    return (
        <span
            className={cx(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                BADGE_TONES[tone],
                className,
            )}
            {...props}
        />
    );
}

type InlineAlertTone = 'info' | 'warning' | 'error';

const INLINE_ALERT_TONES: Record<InlineAlertTone, string> = {
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-800',
};

export interface InlineAlertProps extends React.HTMLAttributes<HTMLDivElement> {
    tone?: InlineAlertTone;
}

export function InlineAlert({ className, tone = 'info', ...props }: InlineAlertProps) {
    return (
        <div
            className={cx(
                'rounded-lg border px-3 py-2 text-xs leading-5',
                INLINE_ALERT_TONES[tone],
                className,
            )}
            role="alert"
            {...props}
        />
    );
}
