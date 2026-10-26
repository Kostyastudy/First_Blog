import { defineConfig } from "astro/config";
import { satteri } from "@astrojs/markdown-satteri";
import { katexPlugin } from "./src/plugins/katex.mjs";

const siteFromEnv = process.env.SITE_URL
  ? process.env.SITE_URL
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://example.com";

export default defineConfig({
  site: siteFromEnv,
  trailingSlash: "never",
  image: {
    layout: "constrained"
  },
  markdown: {
    processor: satteri({
      features: {
        math: true,
        rawHtml: true
      },
      hastPlugins: [katexPlugin]
    }),
    shikiConfig: {
      theme: "min-light",
      wrap: true
    }
  }
});
