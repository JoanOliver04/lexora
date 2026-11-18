import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Lexora",
    short_name: "Lexora",
    description: "Your personal language practice, one confirmed review at a time.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#fcfcfd",
    theme_color: "#2457b3",
    icons: [
      { src: "/icons/lexora-v2/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/lexora-v2/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/lexora-v2/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
