"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web";

type LottieAnimationData = Record<string, unknown>;

type LottieCacheEntry = {
  data?: LottieAnimationData;
  promise: Promise<LottieAnimationData>;
};

const lottieCache = new Map<string, LottieCacheEntry>();
let lottiePlayerPromise: Promise<typeof import("lottie-web")> | null = null;

function getCachedAnimationData(src: string) {
  return lottieCache.get(src)?.data ?? null;
}

export function preloadMoodLottie(src: string) {
  const cached = lottieCache.get(src);
  if (cached) return cached.promise;

  const entry: LottieCacheEntry = {
    promise: fetch(src, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Lottie request failed: ${response.status}`);
        const animationData: unknown = await response.json();
        if (!animationData || typeof animationData !== "object" || Array.isArray(animationData)) {
          throw new Error("Lottie response is not a JSON object");
        }
        return animationData as LottieAnimationData;
      })
      .then((animationData) => {
        entry.data = animationData;
        return animationData;
      })
      .catch((error) => {
        lottieCache.delete(src);
        throw error;
      }),
  };

  lottieCache.set(src, entry);
  return entry.promise;
}

function preloadLottiePlayer() {
  lottiePlayerPromise ??= import("lottie-web");
  return lottiePlayerPromise;
}

export function MoodLottiePreloader({ src }: { src: string }) {
  useEffect(() => {
    void Promise.all([preloadMoodLottie(src), preloadLottiePlayer()]).catch(() => undefined);
  }, [src]);

  return null;
}

export function MoodLottie({ className, loop = false, src }: {
  className?: string;
  loop?: boolean;
  src: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(() => getCachedAnimationData(src));

  useEffect(() => {
    let active = true;
    void preloadMoodLottie(src)
      .then((nextAnimationData) => {
        if (active) setAnimationData(nextAnimationData);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [src]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !animationData) return;

    let animation: AnimationItem | null = null;
    let cancelled = false;
    void preloadLottiePlayer().then(({ default: lottie }) => {
      if (cancelled) return;
      container.replaceChildren();
      animation = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop,
        autoplay: true,
        animationData: JSON.parse(JSON.stringify(animationData)) as LottieAnimationData,
        rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
      });
    });

    return () => {
      cancelled = true;
      animation?.destroy();
      container.replaceChildren();
    };
  }, [animationData, loop]);

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
