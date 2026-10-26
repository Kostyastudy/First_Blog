import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildFrontmatter,
  splitTags,
  toSlug
} from "./import-lib.mjs";

const args = process.argv.slice(2).filter((item) => !item.startsWith("--"));
const options = process.argv.slice(2);

const flag = (name, fallback = "") => {
  const index = options.indexOf(name);
  return index !== -1 ? options[index + 1] ?? fallback : fallback;
};

const rawTitle = args[0];

if (!rawTitle) {
  console.error('用法：npm run new -- "文章标题" --category 方法 --tags 学习,复盘');
  process.exit(1);
}

const title = rawTitle.trim();
const category = flag("--category", "笔记");
const tags = splitTags(flag("--tags", ""));
const slug = toSlug(title);
const target = path.join(process.cwd(), "src", "content", "posts", `${slug}.md`);

if (existsSync(target)) {
  console.error(`文件已存在：src/content/posts/${slug}.md`);
  process.exit(1);
}

await mkdir(path.dirname(target), { recursive: true });

const headline = title;
const description = "";
const body = `\n在这里开始写正文。\n\n## 一个小标题\n\n正文内容。\n`;

const frontmatter = buildFrontmatter({
  title,
  description,
  date: new Date(),
  category,
  tags
});

await writeFile(target, `${frontmatter}${body}`, "utf8");
console.log(`已创建：src/content/posts/${slug}.md`);
