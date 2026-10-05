import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { getNativeMedicationImage } from '../api/image-cache';
export type ImageProps = ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean; unoptimized?: boolean; preload?: boolean };
export default function Image({ fill, priority, unoptimized: _unoptimized, preload, style, src, onError, ...props }: ImageProps) {
  const remote = typeof src === 'string' && /^\/api\/medications\/image\/\d{9}$/.test(src);
  const [loaded, setLoaded] = useState<{source:string;url:string} | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!remote || typeof src !== 'string') return;
    let active = true; let objectUrl: string | undefined;
    void getNativeMedicationImage(src).then(blob => {
      objectUrl = URL.createObjectURL(blob);
      if (active) setLoaded({source:src,url:objectUrl}); else URL.revokeObjectURL(objectUrl);
    }).catch(() => {
      // Let the medication resolver choose the next product image or the 64px fallback.
      // A silent src replacement leaves the parent in product/cover mode.
      if (active) imageRef.current?.dispatchEvent(new Event('error', { bubbles: false }));
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  },[remote,src]);
  const resolved = remote ? (loaded?.source === src ? loaded.url : undefined) : src;
  return <img {...props} ref={imageRef} src={resolved} onError={onError} loading={priority || preload ? 'eager' : props.loading} style={fill ? { position:'absolute',height:'100%',width:'100%',inset:0,...style } : style} />;
}
