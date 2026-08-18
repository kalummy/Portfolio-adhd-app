import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "아디",
    short_name: "아디",
    description: "복용약과 상태를 기록하는 ADDI",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafb",
    theme_color: "#fafafb",
    icons: [
      {
        src: "/icons/addi-app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/addi-app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
