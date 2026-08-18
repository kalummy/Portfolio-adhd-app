import Image from "next/image";

export function SplashScreen() {
  return (
    <main className="splash-screen" aria-label="ADDI 시작 중" aria-busy="true">
      <Image
        className="splash-logo"
        src="/brand/addi-wordmark.svg"
        alt="ADDI"
        width={154}
        height={62}
        preload
      />
    </main>
  );
}
