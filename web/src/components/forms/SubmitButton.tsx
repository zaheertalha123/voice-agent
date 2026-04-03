import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  children: ReactNode;
}

export function SubmitButton({
  isLoading = false,
  disabled,
  children,
  className = '',
  ...props
}: SubmitButtonProps) {
  return (
    <button
      type="submit"
      className={`auth-submit ${isLoading ? 'loading' : ''} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {children}
    </button>
  );
}
