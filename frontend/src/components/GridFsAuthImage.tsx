import React, { useEffect, useState } from 'react';
import { getAuthToken } from '../apiCrud';

export function GridFsAuthImage({
  fileId,
  className,
  alt = 'Attachment preview',
}: {
  fileId: string;
  className?: string;
  alt?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<'loading' | 'image' | 'not-image' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setPhase('loading');
    setUrl(null);
    void (async () => {
      try {
        const t = getAuthToken();
        const res = await fetch(`/api/gridfs/files/${encodeURIComponent(fileId)}/download`, {
          headers: t ? { Authorization: `Bearer ${t}` } : {},
        });
        if (!res.ok) {
          throw new Error(String(res.status));
        }
        const blob = await res.blob();
        if (cancelled) return;
        if (!blob.type.startsWith('image/')) {
          setPhase('not-image');
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setPhase('image');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  if (phase === 'loading') {
    return <span className="text-[11px] text-slate-600">…</span>;
  }
  if (phase === 'error') {
    return <span className="text-[11px] text-slate-600">—</span>;
  }
  if (phase === 'not-image') {
    return <span className="text-[11px] text-slate-600">—</span>;
  }
  if (!url) return null;
  return <img src={url} alt={alt} className={className ?? 'max-h-56 w-auto rounded-lg border border-slate-700 mt-1'} />;
}
