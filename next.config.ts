import type { NextConfig } from "next";

const PILOT = "igcse-chemistry";

/**
 * The per-course Learning Hub is the primary IA now. The pre-hub experiment
 * surfaces live on as redirects (query strings like ?spec=4CH1-1.1 are
 * preserved automatically), so every old deep link keeps working.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async redirects() {
    return [
      { source: "/revision-notes", destination: `/courses/${PILOT}/revision-notes`, permanent: false },
      { source: "/revision-notes/:noteId", destination: `/courses/${PILOT}/revision-notes/:noteId`, permanent: false },
      { source: "/exam-questions", destination: `/courses/${PILOT}/exam-questions`, permanent: false },
      { source: "/flashcards", destination: `/courses/${PILOT}/flashcards`, permanent: false },
    ];
  },
};

export default nextConfig;
