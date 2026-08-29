import Image from "next/image";
import Link from "next/link";

export function MyHomeSubheader({ title, href = "/my" }: { title: string; href?: string }) {
  return (
    <header className="my-home-header my-home-subheader">
      <Link href={href} aria-label="이전 화면">
        <Image src="/icons/back.svg" alt="" width={18} height={14} />
      </Link>
      <strong>{title}</strong>
      <span aria-hidden="true" />
    </header>
  );
}
