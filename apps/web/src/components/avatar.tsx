'use client';

import { useState } from 'react';
import { initials } from '@/lib/format';

/**
 * Plex avatar over an initials disc. The initials always render underneath, so a photo that hasn't
 * loaded yet, fails, or comes back empty still shows who it is.
 * Plain <img>: plex.tv thumbs are already sized and cached, and Next's image optimiser would add a
 * remote-host allowlist for no gain.
 */
export function Avatar({
  name,
  thumb,
  size = 32,
  tone = 'sheet',
  muted = false,
}: {
  name: string;
  thumb: string | null;
  size?: number;
  tone?: 'sheet' | 'rail';
  muted?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const ring = tone === 'rail' ? 'ring-white/15' : 'ring-rule';
  const showImg = !!thumb && thumb.startsWith('https://') && !failed;
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ring-1 ${ring} ${
        tone === 'rail' ? 'bg-rail-active text-rail-ink' : 'bg-blue-wash text-blue'
      } ${muted ? 'opacity-60 grayscale' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
      {showImg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          onLoad={(e) => {
            // A 1×1 or empty response is a placeholder, not a photo.
            if (e.currentTarget.naturalWidth <= 1) setFailed(true);
          }}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}
