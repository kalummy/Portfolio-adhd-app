"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FlowHeader } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { resetDraft } from "@/lib/registration-session";

export function MedicationMethodScreen({ returnHref }: { returnHref: "/" | "/medications" }) {
  const router = useRouter();

  function start(path: "/medications/new/photo" | "/medications/new/search") {
    resetDraft();
    const origin = returnHref === "/medications" ? "?origin=medications" : "";
    router.push(`${path}${origin}`);
  }

  return (
    <MobileShell className="flow-screen">
      <FlowHeader title="약 추가" fallbackHref={returnHref} />
      <section className="flow-content method-content">
        <h1>현재 복용중인<br />약을 추가해보세요</h1>
        <div className="method-grid">
          <button type="button" className="method-card" onClick={() => start("/medications/new/photo")}>
            <span className="method-icon" aria-hidden="true">
              <Image src="/icons/camera.svg" alt="" width={32} height={28} />
            </span>
            <strong>처방전/약봉투<br />촬영해서 추가</strong>
          </button>
          <button type="button" className="method-card" onClick={() => start("/medications/new/search")}>
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
