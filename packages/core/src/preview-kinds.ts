/** The emails the admin can preview. No imports: client components use this. */
export const PREVIEW_KINDS = ['digest', 'arrivals', 'recap', 'leaving', 'nudge', 'warning', 'goodbye'] as const;
export type PreviewKind = (typeof PREVIEW_KINDS)[number];

export const PREVIEW_LABELS: Record<PreviewKind, string> = {
  digest: 'Weekly digest',
  arrivals: 'New arrivals',
  recap: 'Monthly recap',
  leaving: 'Leaving soon',
  nudge: 'Nudge',
  warning: 'Access warning',
  goodbye: 'Goodbye',
};

export const isPreviewKind = (v: string | null | undefined): v is PreviewKind => !!v && (PREVIEW_KINDS as readonly string[]).includes(v);
