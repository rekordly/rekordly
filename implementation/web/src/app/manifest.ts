import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rekordly — Financial Recordkeeping",
    short_name: "Rekordly",
    description: "Server-authoritative business and personal financial recordkeeping with safe offline drafting.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/rekordly-logo.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
