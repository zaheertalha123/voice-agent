import type { ReactNode } from 'react';
import './PageLayout.css';

export type PageLayoutVariant = 'default' | 'narrow' | 'wide';

interface PageLayoutProps {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  headerActions?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  variant?: PageLayoutVariant;
  className?: string;
}

export function PageLayout({
  title,
  subtitle,
  eyebrow,
  headerActions,
  icon,
  children,
  variant = 'default',
  className = '',
}: PageLayoutProps) {
  const hasHeader = eyebrow || title || subtitle || headerActions || icon;

  return (
    <div className={`page-shell page-shell--${variant} ${className}`.trim()}>
      <div className="page-shell__inner">
        {hasHeader && (
          <header className="page-shell__header">
            <div className="page-shell__header-main">
              {icon && <div className="page-shell__icon">{icon}</div>}
              <div className="page-shell__header-text">
                {eyebrow && <span className="page-shell__eyebrow">{eyebrow}</span>}
                {title && <h1 className="page-shell__title">{title}</h1>}
                {subtitle && <p className="page-shell__subtitle">{subtitle}</p>}
              </div>
            </div>
            {headerActions && <div className="page-shell__actions">{headerActions}</div>}
          </header>
        )}
        <div className="page-shell__content">{children}</div>
      </div>
    </div>
  );
}

interface PageSectionProps {
  title?: string;
  subtitle?: string;
  headerExtra?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'flush';
}

export function PageSection({
  title,
  subtitle,
  headerExtra,
  children,
  className = '',
  variant = 'default',
}: PageSectionProps) {
  const hasHead = title || subtitle || headerExtra;
  const headRow = Boolean(headerExtra);

  return (
    <section
      className={`page-section ${variant === 'flush' ? 'page-section--flush' : ''} ${className}`.trim()}
    >
      {hasHead && (
        <div className={`page-section__head ${headRow ? 'page-section__head--row' : ''}`}>
          <div className="page-section__head-text">
            {title && <h2 className="page-section__title">{title}</h2>}
            {subtitle && <p className="page-section__sub">{subtitle}</p>}
          </div>
          {headerExtra}
        </div>
      )}
      <div className="page-section__body">{children}</div>
    </section>
  );
}
