import type { APIRoute } from "astro";
import { getPostBody, getSortedDocs, getSortedPosts } from "../utils/posts";

const MAX_TEXT = 30000;

function stripMarkdown(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?/g, ""))
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]+\$/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export const GET: APIRoute = async () => {
  const posts = await getSortedPosts();
  const docs = await getSortedDocs();

  const entries = [
    ...posts.map((post) => ({
      id: post.id,
      type: "post",
      title: post.data.title,
      description: post.data.description,
      tags: post.data.tags,
      category: post.data.category,
      date: post.data.pubDate.toISOString(),
      url: `/notes/${post.id}`,
      text: stripMarkdown(getPostBody(post)).slice(0, MAX_TEXT)
    })),
    ...docs.map((doc) => ({
      id: doc.id,
      type: "doc",
      title: doc.data.title,
      description: doc.data.description,
      tags: doc.data.tags,
      category: doc.data.category,
      date: doc.data.pubDate.toISOString(),
      url: `/library/${doc.id}`,
      text: stripMarkdown(`${doc.data.description}\n${getPostBody(doc)}`).slice(0, MAX_TEXT)
    }))
  ];

  return new Response(JSON.stringify(entries), {
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
};
