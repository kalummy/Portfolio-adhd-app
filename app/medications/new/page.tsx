"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FlowHeader } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { resetDraft } from "@/lib/registration-session";

export default function MedicationMethodPage() {
  const router = useRouter();

  function startPhoto() {
    resetDraft();
    router.push("/medications/new/photo");
  }

  function startSearch() {
    resetDraft();
    router.push("/medications/new/search");
  }

  return (
    <MobileShell className="flow-screen">
      <FlowHeader title="약 추가" fallbackHref="/" />
      <section className="flow-content method-content">
        <h1>현재 복용중인<br />약을 추가해보세요</h1>
        <div className="method-grid">
          <button type="button" className="method-card" onClick={startPhoto}>
            <span className="method-icon" aria-hidden="true">
              <Image src="/icons/camera.svg" alt="" width={32} height={28} />
            </span>
            <strong>처방전/약봉투<br />촬영해서 추가</strong>
          </button>
          <button type="button" className="method-card" onClick={startSearch}>
            <span className="method-icon" aria-hidden="true">
              <Image src="/icons/search.svg" alt="" width={32} height={29} />
            </span>
            <strong>약 이름을<br />검색해서 추가</strong>
          </button>
        </div>
      </section>
    </MobileShell>
  );
}
