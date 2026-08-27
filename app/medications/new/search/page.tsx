"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useLayoutEffect, useState } from "react";
import { FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { FREQUENT_MEDICATION_GROUPS } from "@/lib/frequent-medications";
import { enrichOfficialMedication } from "@/lib/medication-enrichment";
import { medicationLabel } from "@/lib/medication-utils";
import {
  confirmPendingCandidates,
  dateContextHref,
  getDraft,
  registrationHref,
  rollbackProvisionalMedications,
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

function medicationSelectionKey(medication: MedicationCandidate) {
  return medication.catalogId
    ?? `${medication.name}:${medication.strengthValue}:${medication.strengthUnit}`;
}

export default function MedicationSearchPage() {
  const router = useRouter();
  const [returnHref, setReturnHref] = useState("/");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [selectedMedicationKey, setSelectedMedicationKey] = useState<string>();
  const [activatingMedicationKey, setActivatingMedicationKey] = useState<string>();
  const [results, setResults] = useState<MedicationCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvedQuery, setResolvedQuery] = useState("");

  useEffect(() => {
    const searchParameters = new URLSearchParams(window.location.search);
    if (searchParameters.get("return") === "review") {
      setReturnHref(registrationHref("/medications/new/review"));
    } else if (searchParameters.get("origin") === "medications") {
      setReturnHref(dateContextHref("/medications"));
    }
    const draft = getDraft();
    setQuery(draft.searchQuery);
    const pendingMedication = draft.pendingCandidates.find(
      (medication) => medication.source === "search",
    );
    setSelectedMedicationKey(
      pendingMedication ? medicationSelectionKey(pendingMedication) : undefined,
    );
  }, []);

  useLayoutEffect(() => {
    rollbackProvisionalMedications();
    function handlePageShow() {
      rollbackProvisionalMedications();
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      setSelectedMedicationKey(undefined);
      setActivatingMedicationKey(undefined);
    };
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
    setSelectedMedicationKey(undefined);
    setActivatingMedicationKey(undefined);
    setResults([]);
    setResolvedQuery("");
    updateDraft({ searchQuery: value, pendingCandidates: [] });
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSubmitted(true);
  }

  function openFrequentGroup(groupId: string) {
    if (activatingMedicationKey) return;
    setSelectedMedicationKey(groupId);
    setActivatingMedicationKey(groupId);

    const shouldReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const href = registrationHref(`/medications/new/search/strength?group=${encodeURIComponent(groupId)}`);
    if (shouldReduceMotion) {
      setSelectedMedicationKey(undefined);
      setActivatingMedicationKey(undefined);
      router.push(href);
      return;
    }

    window.setTimeout(() => {
      setSelectedMedicationKey(undefined);
      setActivatingMedicationKey(undefined);
      router.push(href);
    }, SELECTION_FEEDBACK_MS);
  }

  async function selectMedication(medication: MedicationCandidate) {
    if (activatingMedicationKey) return;
    const selectionKey = medicationSelectionKey(medication);
    setSelectedMedicationKey(selectionKey);
    setActivatingMedicationKey(selectionKey);

    const enrichedMedication = await enrichOfficialMedication(medication);
    setPendingCandidates([enrichedMedication], "search");
    updateDraft({ searchQuery: query });
    confirmPendingCandidates();

    const shouldReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (shouldReduceMotion) {
      setSelectedMedicationKey(undefined);
      setActivatingMedicationKey(undefined);
      router.push(registrationHref("/medications/new/review"));
      return;
    }

    window.setTimeout(() => {
      setSelectedMedicationKey(undefined);
      setActivatingMedicationKey(undefined);
      router.push(registrationHref("/medications/new/review"));
    }, SELECTION_FEEDBACK_MS);
  }

  const showNoResults = submitted
    && !loading
    && resolvedQuery === query.trim()
    && results.length === 0;

  return (
    <MobileShell className="flow-screen search-screen">
      <FlowHeader fallbackHref={returnHref} />
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

      {!query.trim() ? (
        <section className="frequent-medications" aria-labelledby="frequent-medications-title">
          <h1 id="frequent-medications-title">자주 찾는 약</h1>
          <div className="search-results frequent-medication-list">
            {FREQUENT_MEDICATION_GROUPS.map((group) => {
              const isSelected = selectedMedicationKey === group.id;
              const isActivating = activatingMedicationKey === group.id;
              return (
                <button
                  type="button"
                  className={`search-result-row ${isSelected ? "selected" : ""} ${isActivating ? "activating" : ""}`}
                  key={group.id}
                  onClick={() => openFrequentGroup(group.id)}
                  aria-pressed={isSelected}
                  aria-busy={isActivating}
                >
                  <span className="search-result-content">
                    <span className="search-result-icon" aria-hidden="true">
                      <Image src="/icons/pill.svg" alt="" width={16} height={20} />
                    </span>
                    <span className="search-result-copy">
                      <span className="search-result-name">{group.label}</span>
                      <small>{group.manufacturer}</small>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : !showNoResults ? (
        <section className="search-results" aria-label="약 검색 결과" aria-busy={loading}>
          {results.map((medication) => {
            const label = medicationLabel(medication);
            const selectionKey = medicationSelectionKey(medication);
            const isSelected = selectedMedicationKey === selectionKey;
            const isActivating = activatingMedicationKey === selectionKey;
            return (
              <button
                type="button"
                className={`search-result-row ${isSelected ? "selected" : ""} ${isActivating ? "activating" : ""}`}
                key={selectionKey}
                onClick={() => void selectMedication(medication)}
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
