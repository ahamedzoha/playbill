'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Choice = 'system' | 'light' | 'dark';
const NEXT: Record<Choice, Choice> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Choice, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/** Cycles system → light → dark. The choice is per browser (localStorage). */
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const [choice, setChoice] = useState<Choice>('system');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('playbill-theme');
      if (saved === 'light' || saved === 'dark') setChoice(saved);
    } catch {
      // Storage blocked: stay on system.
    }
  }, []);

  function cycle() {
    const next = NEXT[choice];
    setChoice(next);
    try {
      if (next === 'system') localStorage.removeItem('playbill-theme');
      else localStorage.setItem('playbill-theme', next);
    } catch {
      // Not fatal: the theme still applies for this page view.
    }
    if (next === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  }

  const Icon = choice === 'dark' ? Moon : choice === 'light' ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={cycle}
      className="inline-flex items-center gap-2 rounded-md py-1 hover:text-rail-ink"
      aria-label={`Theme: ${LABEL[choice]}. Change theme`}
      title={`Theme: ${LABEL[choice]}`}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      {!compact && <span>Theme: {LABEL[choice]}</span>}
    </button>
  );
}
