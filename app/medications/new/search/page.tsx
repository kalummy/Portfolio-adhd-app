"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { medicationLabel } from "@/lib/medication-utils";
import {
  getDraft,
  registrationHref,
  setManualReturnHref,
  setPendingCandidates,
  updateDraft,
} from "@/lib/registration-session";
import type { MedicationCandidate } from "@/lib/types";

type MedicationSearchResponse = {
  medications?: MedicationCandidate[];
};

const SEARCH_DEBOUNCE_MS = 250;
const SELECTION_FEEDBACK_MS = 100;
const SEARCH_CACHE_LIMIT = 20;
const searchResultCache = new Map<string, MedicationCandidate[]>();

function readCachedSearch(query: string) {
  const cached = searchResultCache.get(query);
  if (!cached) return undefined;
  searchResultCache.delete(query);
  searchResultCache.set(query, cached);
  return cached;
}

function cacheSearch(query: string, medications: MedicationCandidate[]) {
  searchResultCache.delete(query);
  searchResultCache.set(query, medications);
  if (searchResultCache.size <= SEARCH_CACHE_LIMIT) return;
  const oldestQuery = searchResultCache.keys().next().value;
  if (typeof oldestQuery === "string") searchResultCache.delete(oldestQuery);
}

function HighlightedMedicationName({ label, query }: { label: string; query: string }) {
  const normalizedQuery = query.trim();
  const index = label.toLowerCase().indexOf(normalizedQuery.toLowerCase());
  if (!normalizedQuery || index < 0) return <>{label}</>;

  return (
    <>
      {label.slice(0, index)}
      <strong>{label.slice(index, index + normalizedQuery.length)}</strong>
      {label.slice(index + normalizedQuery.length)}
    </>
  );
}

export default function MedicationSearchPage() {
  const router = useRouter();
  const [methodHref, setMethodHref] = useState("/medications/new");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>();
  const [activatingCatalogId, setActivatingCatalogId] = useState<string>();
  const [results, setResults] = useState<MedicationCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvedQuery, setResolvedQuery] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("origin") === "medications") {
      setMethodHref("/medications/new?origin=medications");
    }
    const draft = getDraft();
    setQuery(draft.searchQuery);
    setSelectedCatalogId(
      draft.pendingCandidates.find((medication) => medication.source === "search")?.catalogId,
    );
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setResults([]);
      setLoading(false);
      setResolvedQuery("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const cached = readCachedSearch(normalizedQuery);
      if (cached) {
        setResults(cached);
        setResolvedQuery(normalizedQuery);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`/api/medications/search?q=${encodeURIComponent(normalizedQuery)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("의약품 검색에 실패했어요.");
        const payload = await response.json() as MedicationSearchResponse;
        const medications = Array.isArray(payload.medications) ? payload.medications : [];
        cacheSearch(normalizedQuery, medications);
        setResults(medications);
        setResolvedQuery(normalizedQuery);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setResults([]);
        setResolvedQuery(normalizedQuery);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function handleQuery(value: string) {
    setQuery(value);
    setSubmitted(false);
    setSelectedCatalogId(undefined);
    setResults([]);
    setResolvedQuery("");
    updateDraft({ searchQuery: value, pendingCandidates: [] });
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSubmitted(true);
  }

  function selectMedication(medication: MedicationCandidate) {
    if (activatingCatalogId) return;
    setSelectedCatalogId(medication.catalogId);
    setPendingCandidates([medication], "search");
    updateDraft({ searchQuery: query });

    const shouldReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (shouldReduceMotion) {
      router.push(registrationHref("/medications/new/confirm"));
      return;
    }

    setActivatingCatalogId(medication.catalogId);
    window.setTimeout(() => {
      router.push(registrationHref("/medications/new/confirm"));
    }, SELECTION_FEEDBACK_MS);
  }

  const showNoResults = submitted
    && !loading
    && resolvedQuery === query.trim()
    && results.length === 0;

  return (
    <MobileShell className="flow-screen search-screen">
      <FlowHeader fallbackHref={methodHref} />
      <form className="search-form" onSubmit={submitSearch}>
        <input
          value={query}
          onChange={(event) => handleQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && query.trim()) {
              event.preventDefault();
              setSubmitted(true);
            }
          }}
          placeholder="약 이름을 검색해주세요"
          aria-label="약 이름"
          autoFocus
        />
        {query ? (
          <button type="button" onClick={() => handleQuery("")} aria-label="검색어 지우기">
            <Image src="/icons/close-circle.svg" alt="" width={16.25} height={16.25} />
          </button>
        ) : null}
      </form>

      {query && !showNoResults ? (
        <section className="search-results" aria-label="약 검색 결과" aria-busy={loading}>
          {results.map((medication) => {
            const label = medicationLabel(medication);
            const isSelected = selectedCatalogId === medication.catalogId;
            const isActivating = activatingCatalogId === medication.catalogId;
            return (
              <button
                type="button"
                className={`search-result-row ${isSelected ? "selected" : ""} ${isActivating ? "activating" : ""}`}
                key={medication.catalogId}
                onClick={() => selectMedication(medication)}
                aria-pressed={isSelected}
                aria-busy={isActivating}
              >
                <span className="search-result-content">
                  <span className="search-result-icon" aria-hidden="true">
                    <Image src="/icons/pill.svg" alt="" width={16} height={20} />
                  </span>
                  <span className="search-result-copy">
                    <span className="search-result-name"><HighlightedMedicationName label={label} query={query} /></span>
                    <small>{medication.manufacturer}</small>
                  </span>
                </span>
              </button>
            );
          })}
        </section>
      ) : null}

      {showNoResults ? (
        <section className="no-results-state">
          <div className="no-results-icon">?</div>
          <strong>검색한 약을 찾을 수 없어요<br />직접 입력해주세요</strong>
          <PrimaryButton
            type="button"
            onClick={() => {
              updateDraft({ manualName: query, pendingCandidates: [] });
              setManualReturnHref(registrationHref("/medications/new/search"));
              router.push(registrationHref("/medications/new/manual/name"));
            }}
          >
            직접 입력
          </PrimaryButton>
        </section>
      ) : null}
    </MobileShell>
  );
}
