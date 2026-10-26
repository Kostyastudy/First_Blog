import type { APIRoute } from "astro";
import { getAllCategories, getSortedDocs, getSortedPosts } from "../utils/posts";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL("https://example.com");
  const posts = await getSortedPosts();
  const docs = await getSortedDocs();

  const tags = new Set<string>();
  posts.forEach((post) => post.data.tags.forEach((tag) => tags.add(tag)));
  const categories = getAllCategories(posts);

  const urls = [
    { loc: "/", lastmod: posts[0]?.data.pubDate },
    { loc: "/library", lastmod: docs[0]?.data.pubDate },
    { loc: "/categories" },
    { loc: "/search" },
    { loc: "/about" },
    ...posts.map((post) => ({ loc: `/notes/${post.id}`, lastmod: post.data.updatedDate ?? post.data.pubDate })),
    ...docs.map((doc) => ({ loc: `/library/${doc.id}`, lastmod: doc.data.pubDate })),
    ...Array.from(tags).map((tag) => ({ loc: `/tags/${encodeURIComponent(tag)}` })),
    ...categories.map((category) => ({ loc: `/categories/${encodeURIComponent(category.name)}` }))
  ];

  const body = urls
    .map(
      (item) =>
        `  <url><loc>${escapeXml(new URL(item.loc, base).href)}</loc>` +
        (item.lastmod ? `<lastmod>${item.lastmod.toISOString()}</lastmod>` : "") +
        `</url>`
    )
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } }
  );
};
