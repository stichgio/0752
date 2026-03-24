import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-[var(--g-accent)] text-black hover:bg-white/90 active:bg-white/80',
  secondary:
    'border border-[var(--g-border)] bg-[var(--g-surface)] text-[var(--g-text)] hover:border-neutral-500 hover:bg-neutral-800',
  ghost:
    'text-[var(--g-text-dim)] hover:text-[var(--g-text)] hover:bg-white/5',
  danger:
    'border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20',
};

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-2.5 py-1 text-xs gap-1.5 rounded-lg',
  md: 'px-4 py-2 text-sm gap-2 rounded-xl',
  lg: 'px-5 py-2.5 text-base gap-2.5 rounded-xl',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      disabled,
      leadingIcon,
      trailingIcon,
      children,
      className,
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center font-medium font-mono transition-colors select-none',
          variantStyles[variant],
          sizeStyles[size],
          isDisabled && 'opacity-50 pointer-events-none',
          className,
        )}
        {...rest}
      >
        {loading ? (
          <Loader2 size={size === 'sm' ? 14 : 16} className="animate-spin" />
        ) : (
          leadingIcon
        )}
        {children}
        {!loading && trailingIcon}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
