"use client";

import Image from "next/image";
import { useState } from "react";
import { deriveCatCollection } from "@/lib/cat-collection";
import type { MoodRecord } from "@/lib/types";

export function MoodCatCollection({ records }: { records: MoodRecord[] }) {
  const [showLockedFirst, setShowLockedFirst] = useState(false);
  const cats = deriveCatCollection(records, showLockedFirst ? "locked-first" : "acquired-first");
  const sortLabel = showLockedFirst ? "미보유순" : "보유순";

  return (
    <section className="mood-cat-collection" aria-label="내 고양이">
      <button
        type="button"
        className="mood-cat-collection-sort"
        aria-label={`정렬: ${sortLabel}`}
        onClick={() => setShowLockedFirst((current) => !current)}
        data-mp-replay-block=""
      >
        <Image src="/icons/sort-filter.svg" alt="" width={20} height={20} />
        <span>{sortLabel}</span>
      </button>
      <ul className="mood-cat-collection-grid" data-mp-replay-block="">
        {cats.map((cat, index) => (
          <li className={cat.acquired ? "acquired" : "locked"} key={cat.catalogId}>
            <span
              className={`mood-cat-collection-image ${cat.acquired ? `cat-${cat.catalogId}` : "cat-unknown"}`}
            >
              <Image
                src={cat.imagePath}
                alt=""
                fill
                sizes="64px"
                loading={index < 3 ? "eager" : "lazy"}
              />
            </span>
            <strong>{cat.displayName}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
