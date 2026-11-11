import type { ReactNode } from 'react';
import type { Admin } from '@playbill/core/auth';
import { Avatar } from './avatar';
import { NavLinks, TabBar } from './nav';
import { SignOut } from './sign-out';
import { ThemeSwitch } from './theme-switch';

/**
 * The admin frame: a register-cover rail on wide screens; a slim top bar plus a bottom tab bar on
 * phones, where the owner does a quick weekly check with their thumb.
 */
export function Shell({ admin, server, children }: { admin: Admin; server: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <div className="hidden bg-rail lg:block">
      <aside className="sticky top-0 flex h-dvh flex-col text-rail-ink">
        <div className="px-5 pt-6 pb-5">
          <Wordmark />
          <p className="mt-2 truncate text-sm text-rail-ink-2" title={server}>
            {server}
          </p>
        </div>
        <nav aria-label="Main" className="flex-1 px-3">
          <NavLinks />
        </nav>
        <div className="space-y-3 border-t border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar name={admin.username} thumb={admin.thumb} size={28} tone="rail" />
            <span className="min-w-0 flex-1 truncate text-sm">{admin.username}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-rail-ink-2">
            <ThemeSwitch />
            <SignOut className="hover:text-rail-ink" />
          </div>
        </div>
      </aside>
      </div>

      <header className="sticky top-0 z-20 flex items-center justify-between bg-rail px-4 py-3 text-rail-ink lg:hidden">
        <div className="flex min-w-0 items-baseline gap-3">
          <Wordmark />
          <span className="truncate text-sm text-rail-ink-2">{server}</span>
        </div>
        <ThemeSwitch compact />
      </header>

      <main className="min-w-0 px-4 pt-6 pb-28 sm:px-8 lg:px-10 lg:pt-10 lg:pb-16">{children}</main>

      <TabBar />
    </div>
  );
}

/** Two rows of register marks beside the name: the one repeated form, small. */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="1" y="3" width="5" height="5" rx="1.4" fill="var(--mark-1)" />
        <rect x="8.5" y="3" width="5" height="5" rx="1.4" fill="var(--mark-2)" />
        <rect x="16" y="3" width="5" height="5" rx="1.4" fill="currentColor" />
        <rect x="1" y="13" width="5" height="5" rx="1.4" fill="currentColor" />
        <rect x="8.75" y="13.25" width="4.5" height="4.5" rx="1.2" fill="none" stroke="var(--mark-1)" strokeWidth="1.2" />
        <rect x="16" y="13" width="5" height="5" rx="1.4" fill="var(--mark-2)" />
      </svg>
      <span className="text-lg font-semibold tracking-[-0.02em]">Playbill</span>
    </span>
  );
}
