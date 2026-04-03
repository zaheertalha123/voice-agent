import type { ReactNode } from 'react';
import { AppLogo } from '@/components/AppLogo';

interface AuthLayoutProps {
  children: ReactNode;
  subtitle: string;
}

export function AuthLayout({ children, subtitle }: AuthLayoutProps) {
  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon">
              <AppLogo className="auth-logo-img" />
            </div>
            <h1>Voice Bot</h1>
            <p className="auth-subtitle">{subtitle}</p>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
