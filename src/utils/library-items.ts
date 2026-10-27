import type { CollectionEntry } from "astro:content";

type Post = CollectionEntry<"posts">;
type Doc = CollectionEntry<"library">;

export type ContentItem = {
  kind: "note" | "material";
  id: string;
  title: string;
  description: string;
  date: Date;
  folder: string;
  href: string;
  label: string;
  fileType?: string;
  bytes?: number;
  search: string;
};

export function buildContentItems(posts: Post[], docs: Doc[]): ContentItem[] {
  const items: ContentItem[] = [
    ...posts.map((post) => {
      const kind = post.data.kind ?? "note";
      return {
        kind,
        id: post.id,
        title: post.data.title,
        description: post.data.description,
        date: post.data.updatedDate ?? post.data.pubDate,
        folder: post.data.folder || "其他",
        href: `/notes/${post.id}`,
        label: kind === "note" ? "笔记" : "资料",
        search: [post.data.title, post.data.description, post.data.category, ...post.data.tags]
          .join(" ")
          .toLowerCase()
      };
    }),
    ...docs.map((doc) => {
      const kind = doc.data.kind ?? "material";
      const extension = doc.data.file.toLowerCase().split(".").pop() ?? "";
      const fileType =
        extension === "pdf" ? "PDF" : extension === "docx" || extension === "doc" ? "Word" : "文件";

      return {
        kind,
        id: doc.id,
        title: doc.data.title,
        description: doc.data.description,
        date: doc.data.updatedDate ?? doc.data.pubDate,
        folder: doc.data.folder || "其他",
        href: `/library/${doc.id}`,
        label: kind === "note" ? "笔记" : "资料",
        fileType,
        bytes: doc.data.bytes,
        search: [doc.data.title, doc.data.description, doc.data.category, ...doc.data.tags]
          .join(" ")
          .toLowerCase()
      };
    })
  ];

  return items.sort((a, b) => b.date.valueOf() - a.date.valueOf());
}
