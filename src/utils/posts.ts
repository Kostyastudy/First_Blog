import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"posts">;
export type LibraryDoc = CollectionEntry<"library">;

export async function getSortedPosts() {
  const posts = await getCollection("posts", ({ data }) => !data.draft);

  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export async function getSortedDocs() {
  const docs = await getCollection("library", ({ data }) => !data.draft);

  return docs.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function getPostBody(post: Post) {
  return (post as Post & { body?: string }).body ?? "";
}

export function estimateReadingTime(text: string) {
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const words = (text.match(/[A-Za-z0-9]+/g) ?? []).length;
  const minutes = Math.max(1, Math.ceil(cjk / 400 + words / 200));

  return `${minutes} 分钟`;
}

export function getReadingTime(post: Post) {
  const manual = post.data.readingTime?.trim();
  return manual ? manual : estimateReadingTime(getPostBody(post));
}

export function getAllTags(posts: Post[]) {
  const counts = posts.reduce<Record<string, number>>((result, post) => {
    post.data.tags.forEach((tag) => {
      result[tag] = (result[tag] || 0) + 1;
    });
    return result;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
}

export function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "未知大小";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function docHref(doc: LibraryDoc) {
  return `/library/${doc.id}`;
}

export function pdfSrc(file: string) {
  return encodeURI(file);
}
