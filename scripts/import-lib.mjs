import path from "node:path";

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]);
export const PDF_EXTENSIONS = new Set([".pdf"]);

export function normalizePath(value) {
  return String(value ?? "").replaceAll("\\", "/").replace(/^\.\//, "").trim();
}

export function toSlug(input, fallback = "note") {
  const slug = String(input ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\.(md|markdown)$/i, "")
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=~^[\]();,]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);

  return slug || fallback;
}

export function splitTags(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,，;；\s]+/)
      .map((item) => item.replace(/^#/, "").trim())
      .filter(Boolean);
  }

  return [];
}

export function firstHeading(body) {
  const match = String(body).match(/^\s{0,3}#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : "";
}

export function removeFirstHeading(body) {
  return String(body).replace(/^\s{0,3}#\s+.+?\s*\n/, "");
}

export function stripMarkdownForSummary(text) {
  return String(text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/!\[\[[^\]]*\]\]/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => label || target)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/[*_~`$]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function deriveDescription(body, limit = 100) {
  const text = stripMarkdownForSummary(body);
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function stripComments(body) {
  return String(body)
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/[ \t]+\^[A-Za-z0-9-]+\s*$/gm, "");
}

/**
 * Obsidian callouts are flattened to a normal blockquote with a bold title.
 * `> [!quote]- 标题` becomes `> **标题**`.
 */
export function convertCallouts(body) {
  return String(body)
    .replace(/^>\s*\[![\w-]+\][+-]?\s*(.*)$/gm, (match, title) => {
      const trimmed = String(title).trim();
      return trimmed ? `> **${trimmed}**` : "";
    })
    .replace(/\n{3,}/g, "\n\n");
}

function pageFromAnchor(anchor) {
  const match = String(anchor ?? "").match(/(?:^|[&#])page=(\d+)/);
  return match ? match[1] : "";
}

/**
 * Rewrites Obsidian wiki links and embeds. Handler results are Markdown.
 */
export async function convertObsidianLinks(body, handlers) {
  const pattern = /!?\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
  const source = String(body);
  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    result += source.slice(lastIndex, match.index);
    lastIndex = pattern.lastIndex;

    const isEmbed = match[0].startsWith("!");
    const target = normalizePath(match[1]);
    const anchor = match[2] ?? "";
    const label = (match[3] ?? "").trim();
    const extension = path.extname(target).toLowerCase();
    const isNoteExtension = extension === ".md" || extension === ".markdown";
    const isFileExtension = !isNoteExtension && /^\.[a-z0-9]{1,6}$/i.test(extension);
    const page = pageFromAnchor(anchor);

    if (IMAGE_EXTENSIONS.has(extension)) {
      result += await handlers.image({ target, label, isEmbed });
      continue;
    }

    if (PDF_EXTENSIONS.has(extension)) {
      result += await handlers.pdf({ target, label, page, isEmbed });
      continue;
    }

    if (isFileExtension) {
      result += await handlers.file({ target, label });
      continue;
    }

    result += await handlers.note({ target, label });
  }

  result += source.slice(lastIndex);
  return result;
}

export function formatDate(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.valueOf())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

export function buildFrontmatter({ title, description, date, category, tags, extra = [] }) {
  const lines = [
    "---",
    `title: ${yamlString(title)}`,
    `description: ${yamlString(description)}`,
    `pubDate: ${formatDate(date)}`,
    `category: ${yamlString(category)}`,
    `tags: [${tags.map((tag) => yamlString(tag)).join(", ")}]`,
    ...extra,
    "---",
    ""
  ];

  return lines.join("\n");
}

export function isProbablyNoteTarget(target) {
  const extension = path.extname(target).toLowerCase();
  return !extension || extension === ".md" || extension === ".markdown";
}
