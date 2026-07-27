// client/src/components/admin/common/AdminSection.tsx
import React from 'react';

interface AdminSectionProps {
  title: string;
  children: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  className?: string; // Allow custom classes if needed
}

export const AdminSection = React.memo(
  ({ title, children, actions, className = '' }: AdminSectionProps) => {
    return (
      <section className={`mb-10 ${className}`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h2>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
        <div>{children}</div>
      </section>
    );
  }
);

AdminSection.displayName = 'AdminSection';
