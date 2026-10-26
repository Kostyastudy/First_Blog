import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/posts"
  }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(""),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.string().default("笔记"),
    tags: z.array(z.string()).default([]),
    readingTime: z.string().optional(),
    featured: z.boolean().default(false),
    cover: z.string().optional(),
    draft: z.boolean().default(false)
  })
});

const library = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/library"
  }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(""),
    file: z.string(),
    pubDate: z.coerce.date(),
    category: z.string().default("资料"),
    tags: z.array(z.string()).default([]),
    bytes: z.number().optional(),
    draft: z.boolean().default(false)
  })
});

export const collections = { posts, library };
