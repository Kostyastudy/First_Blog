import rss from "@astrojs/rss";
import { siteConfig } from "../config";
import { getSortedPosts } from "../utils/posts";

export async function GET(context: { site: URL | undefined }) {
  const posts = await getSortedPosts();

  return rss({
    title: siteConfig.title,
    description: siteConfig.description,
    site: context.site ?? "https://example.com",
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/notes/${post.id}`
    })),
    customData: "<language>zh-cn</language>"
  });
}
