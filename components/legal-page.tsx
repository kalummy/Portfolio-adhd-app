import type { ReactNode } from "react";
import { FlowHeader } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";

export type LegalSection = {
  title: string;
  content: ReactNode;
};

type LegalPageProps = {
  title: string;
  intro: string;
  sections: LegalSection[];
  className?: string;
  published?: {
    effectiveDate: string;
  };
};

export function LegalPage({
  title,
  intro,
  sections,
  className = "",
  published,
}: LegalPageProps) {
  return (
    <MobileShell className={`legal-screen ${className}`.trim()}>
      <FlowHeader title={title} fallbackHref="/" />
      <article className="legal-content">
        <div className="legal-intro">
          <h1>{title}</h1>
          <p>{intro}</p>
          <small>{published?.effectiveDate ?? "최종 수정일 2026년 8월 19일"}</small>
        </div>

        <div className="legal-sections">
          {sections.map((section, index) => (
            <section key={section.title}>
              <h2>{index + 1}. {section.title}</h2>
              <div>{section.content}</div>
            </section>
          ))}
        </div>

        {published ? null : (
          <p className="legal-draft-note">
            본 문서는 아디(ADDI) MVP 운영을 위한 초안이며, 정식 운영 전 법률·운영 검토를 거쳐 확정됩니다.
          </p>
        )}
      </article>
    </MobileShell>
  );
}
