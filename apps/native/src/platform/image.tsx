import type { ImgHTMLAttributes } from 'react';
export type ImageProps = ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean; unoptimized?: boolean; preload?: boolean };
export default function Image({ fill, priority, unoptimized: _unoptimized, preload, style, ...props }: ImageProps) {
  return <img {...props} loading={priority || preload ? 'eager' : props.loading} style={fill ? { position: 'absolute', height: '100%', width: '100%', inset: 0, ...style } : style} />;
}
