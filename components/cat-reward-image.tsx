"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import { getCat, UNKNOWN_CAT, type CatId } from "@/lib/cats";

type CatRewardImageProps = Omit<ImageProps, "src"> & {
  catId: CatId;
};

export function CatRewardImage({ catId, className, onError, ...props }: CatRewardImageProps) {
  const [failedCatId, setFailedCatId] = useState<CatId>();
  const failed = failedCatId === catId;
  const cat = getCat(catId);

  return (
    <Image
      {...props}
      className={[className, failed ? "cat-reward-image-fallback" : ""].filter(Boolean).join(" ")}
      src={failed ? UNKNOWN_CAT.imagePath : cat.imagePath}
      onError={(event) => {
        onError?.(event);
        if (failed) return;
        console.error("cat_asset_load_failed", { catId });
        setFailedCatId(catId);
      }}
    />
  );
}
