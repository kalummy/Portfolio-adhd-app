"use client";

import { Lottie } from "lottie-react";

export function MoodLottie({ className, loop = false, src }: {
  className?: string;
  loop?: boolean;
  src: string;
}) {
  return (
    <Lottie
      className={className}
      src={src}
      autoplay
      loop={loop}
      aria-hidden="true"
    />
  );
}
