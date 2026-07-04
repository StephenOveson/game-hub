import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Card Room — Golf & Liar's Dice",
    short_name: "Card Room",
    description: "Real-time multiplayer Golf and Liar's Dice with friends.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#120d08",
    theme_color: "#120d08",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
