import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import sharp from "sharp";
import {
  IMAGE_EXTENSIONS,
  PDF_EXTENSIONS,
  buildFrontmatter,
  convertCallouts,
  convertObsidianLinks,
  deriveDescription,
  firstHeading,
  normalizePath,
  removeFirstHeading,
  splitTags,
  stripComments,
  toSlug
} from "./import-lib.mjs";

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const result = {
    dryRun: false,
    force: false,
    maxPdfMb: 20,
    limit: Number.POSITIVE_INFINITY
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = () => argv[(index += 1)];
    switch (item) {
      case "--dry-run":
        result.dryRun = true;
        break;
      case "--force":
        result.force = true;
        break;
      case "--vault":
        result.vault = next();
        break;
      case "--inbox":
        result.inbox = next();
        break;
      case "--root":
        result.root = next();
        break;
      case "--category":
        result.category = next();
        break;
      case "--tags":
        result.tags = next();
        break;
      case "--max-pdf-mb":
        result.maxPdfMb = Number(next());
        break;
      case "--limit":
        result.limit = Number(next());
        break;
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        if (item.startsWith("--")) {
          console.error(`未知参数：${item}`);
          process.exit(1);
        }
    }
  }

  return result;
}

function printHelp() {
  console.log(`用法：
  npm run import -- [选项]

选项：
  --dry-run            只扫描并输出报告，不写任何文件
  --vault <path>       从 Obsidian 仓库导入（只读，不修改源文件）
  --inbox <path>       从投放目录导入（默认 ./inbox）
  --root <path>        输出根目录（默认当前项目）
  --category <name>    默认分类
  --tags <a,b>         追加标签，逗号分隔
  --max-pdf-mb <n>     超过该大小的 PDF 跳过（默认 20）
  --limit <n>          最多导入 n 篇笔记
  --force              覆盖已存在的同名文章
`);
}

const root = path.resolve(args.root ?? process.cwd());
const dryRun = args.dryRun;
const mode = args.vault ? "vault" : "inbox";
const source = path.resolve(args.vault ?? args.inbox ?? path.join(root, "inbox"));
const maxPdfBytes = (Number.isFinite(args.maxPdfMb) ? args.maxPdfMb : 20) * 1024 * 1024;
const extraTags = splitTags(args.tags);
const defaultCategory = args.category || "";

const outPosts = path.join(root, "src", "content", "posts");
const outLibrary = path.join(root, "src", "content", "library");
const outAssets = path.join(root, "src", "assets", "imported");
const outFiles = path.join(root, "public", "files");

const stats = {
  mode,
  dryRun,
  source,
  notes: 0,
  skippedNotes: 0,
  images: 0,
  pdfs: 0,
  files: 0,
  unresolved: [],
  largePdf: [],
  errors: [],
  written: []
};

if (!existsSync(source)) {
  console.error(`源目录不存在：${source}`);
  process.exit(1);
}

const allFiles = await walk(source);
const markdownFiles = allFiles.filter((file) => /\.md$/i.test(file));
const attachmentFiles = allFiles.filter((file) => !/\.md$/i.test(file));

if (!dryRun) {
  await mkdir(outPosts, { recursive: true });
  await mkdir(outLibrary, { recursive: true });
  await mkdir(outAssets, { recursive: true });
  await mkdir(outFiles, { recursive: true });
}

const existingSlugs = new Set();
if (existsSync(outPosts)) {
  for (const entry of await readdir(outPosts, { withFileTypes: true })) {
    if (!entry.isDirectory()) existingSlugs.add(entry.name.replace(/\.md$/i, ""));
  }
}

const existingDocSlugs = new Set();
if (existsSync(outLibrary)) {
  for (const entry of await readdir(outLibrary, { withFileTypes: true })) {
    if (!entry.isDirectory()) existingDocSlugs.add(entry.name.replace(/\.md$/i, ""));
  }
}

const docSlugFor = (() => {
  const used = new Set();
  return (value) => {
    const base = toSlug(value, "document");
    let slug = base;
    let counter = 2;
    while (used.has(slug) || (existingDocSlugs.has(slug) && !args.force)) {
      slug = `${base}-${counter}`;
      counter += 1;
    }
    used.add(slug);
    return slug;
  };
})();

const slugFor = (() => {
  const used = new Set();
  return (value) => {
    const base = toSlug(value);
    let slug = base;
    let counter = 2;
    while (used.has(slug) || (existingSlugs.has(slug) && !args.force)) {
      slug = `${base}-${counter}`;
      counter += 1;
    }
    used.add(slug);
    return slug;
  };
})();

// Note lookup for [[wiki links]] across the whole source tree.
const noteByPath = new Map();
const noteByBase = new Map();
const selectedNotes = markdownFiles.slice(0, Number.isFinite(args.limit) ? args.limit : undefined);

for (const file of selectedNotes) {
  const relative = normalizePath(path.relative(source, file));
  const withoutExtension = relative.replace(/\.md$/i, "");
  const base = path.basename(withoutExtension);
  noteByPath.set(withoutExtension.toLowerCase(), { file, relative, slug: null });
  if (!noteByBase.has(base.toLowerCase())) noteByBase.set(base.toLowerCase(), withoutExtension.toLowerCase());
}

for (const record of noteByPath.values()) {
  record.slug = slugFor(record.relative.replace(/\.md$/i, "").split("/").pop());
}

// Attachment lookup (images, PDFs, other files).
const attachmentByPath = new Map();
const attachmentByBase = new Map();

for (const file of attachmentFiles) {
  const relative = normalizePath(path.relative(source, file));
  attachmentByPath.set(relative.toLowerCase(), file);
  const base = path.basename(relative).toLowerCase();
  const list = attachmentByBase.get(base) ?? [];
  list.push(file);
  attachmentByBase.set(base, list);
}

let currentNoteRelative = "";

const commonPrefixScore = (candidate) => {
  const noteParts = currentNoteRelative.toLowerCase().split("/").slice(0, -1);
  const candidateParts = normalizePath(path.relative(source, candidate)).toLowerCase().split("/");
  let score = 0;
  while (score < noteParts.length && score < candidateParts.length - 1 && noteParts[score] === candidateParts[score]) {
    score += 1;
  }
  return score;
};

const pickBasenameCandidate = (candidates) => {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return [...candidates].sort((a, b) => commonPrefixScore(b) - commonPrefixScore(a))[0];
};

const resolveAttachment = (target) => {
  const normalized = normalizePath(target).toLowerCase();
  const decoded = decodeURIComponent(normalized);
  return (
    attachmentByPath.get(normalized) ??
    attachmentByPath.get(decoded) ??
    pickBasenameCandidate(attachmentByBase.get(path.basename(normalized))) ??
    pickBasenameCandidate(attachmentByBase.get(path.basename(decoded))) ??
    null
  );
};

const pdfRegistry = new Map(); // absolute path -> { slug, href }
const skippedLargePdf = new Set();
const imageRegistry = new Map(); // absolute path -> { href }

const imageHandler = async ({ target, label }) => {
  const file = resolveAttachment(target);
  if (!file) {
    stats.unresolved.push({ type: "image", target });
    return `（缺失图片：${target}）`;
  }

  if (dryRun) {
    stats.images += 1;
    return `![${label || path.basename(target)}](pending)`;
  }

  const cached = imageRegistry.get(file);
  if (cached) {
    stats.images += 1;
    return `![${isNumeric(label) ? path.basename(target) : label || path.basename(target)}](${cached.href})`;
  }

  const buffer = await readFile(file);
  const hash = createHash("sha1").update(buffer).digest("hex").slice(0, 12);
  const extension = path.extname(file).toLowerCase();
  let outputName;

  if (extension === ".svg" || extension === ".gif" || extension === ".avif") {
    outputName = `${hash}${extension}`;
    await writeFile(path.join(outAssets, outputName), buffer);
  } else {
    outputName = `${hash}.webp`;
    await sharp(buffer)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(outAssets, outputName));
  }

  const relative = normalizePath(path.relative(outPosts, path.join(outAssets, outputName)));
  const href = relative.startsWith(".") ? relative : `./${relative}`;
  imageRegistry.set(file, { href });
  stats.images += 1;

  return `![${isNumeric(label) ? path.basename(target) : label || path.basename(target)}](${href})`;
};

const pdfHandler = async ({ target, label, page }) => {
  const file = resolveAttachment(target);
  if (!file) {
    stats.unresolved.push({ type: "pdf", target });
    return label || target;
  }

  const info = await registerPdf(file, path.basename(target));
  if (!info) return label || path.basename(target);

  const suffix = page ? `#page=${page}` : "";
  return `[${label || path.basename(target)}](/library/${info.slug}${suffix})`;
};

const fileHandler = async ({ target, label }) => {
  const file = resolveAttachment(target);
  if (!file) {
    stats.unresolved.push({ type: "file", target });
    return label || target;
  }

  if (dryRun) {
    stats.files += 1;
    return label || target;
  }

  const slug = toSlug(path.basename(file, path.extname(file)));
  const name = `${slug}${path.extname(file).toLowerCase()}`;
  const dest = path.join(outFiles, name);
  if (!existsSync(dest)) await copyFile(file, dest);
  stats.files += 1;

  return `[${label || path.basename(file)}](/files/${name})`;
};

const noteHandler = async ({ target, label }) => {
  const key = normalizePath(target).replace(/\.md$/i, "").toLowerCase();
  const record = noteByPath.get(key) ?? noteByPath.get(noteByBase.get(path.basename(key).toLowerCase()));
  if (!record) {
    stats.unresolved.push({ type: "note", target });
    return label || target;
  }

  return `[${label || path.basename(target)}](/notes/${record.slug})`;
};

for (const record of noteByPath.values()) {
  try {
    await importNote(record);
  } catch (error) {
    stats.errors.push({ file: record.relative, message: error.message });
    console.error(`导入失败：${record.relative} -> ${error.message}`);
  }
}

if (mode === "inbox") {
  for (const file of attachmentFiles) {
    if (PDF_EXTENSIONS.has(path.extname(file).toLowerCase())) {
      const relative = normalizePath(path.relative(source, file));
      if (!relative.includes("/")) {
        await registerPdf(file, path.basename(file));
      }
    }
  }
}

if (!dryRun) {
  await mkdir(path.join(root, "inbox", "_imported"), { recursive: true }).catch(() => {});
  const report = {
    generatedAt: new Date().toISOString(),
    ...stats
  };
  await writeFile(path.join(root, "import-report.json"), JSON.stringify(report, null, 2), "utf8");
}

printReport();

async function importNote(record) {
  currentNoteRelative = record.relative;
  const raw = await readFile(record.file, "utf8");
  const parsed = matter(raw);
  const data = parsed.data ?? {};
  const sourceBody = parsed.content;
  const fileStat = await stat(record.file);

  const title = String(data.title || firstHeading(sourceBody) || path.basename(record.relative, ".md")).trim();
  const category =
    String(data.category || data.section || record.relative.split("/")[0] || defaultCategory || "笔记").trim() ||
    "笔记";
  const tags = [
    ...new Set([
      ...splitTags(data.tags),
      ...splitTags(data.tag),
      ...extraTags
    ])
  ];
  const date = data.pubDate || data.date || data.created || fileStat.mtime;
  const description = String(data.description || deriveDescription(stripComments(sourceBody))).trim();

  let body = stripComments(sourceBody);
  body = convertCallouts(body);
  body = removeFirstHeading(body);
  body = await convertObsidianLinks(body, {
    image: imageHandler,
    pdf: pdfHandler,
    file: fileHandler,
    note: noteHandler
  });
  body = body.trim();

  const frontmatter = buildFrontmatter({ title, description, date, category, tags });
  const outputPath = path.join(outPosts, `${record.slug}.md`);
  const exists = existsSync(outputPath);

  stats.notes += 1;

  if (exists && !args.force) {
    stats.skippedNotes += 1;
    return;
  }

  if (!dryRun) {
    await writeFile(outputPath, `${frontmatter}${body}\n`, "utf8");
    stats.written.push({ source: record.relative, output: `src/content/posts/${record.slug}.md`, title });

    if (mode === "inbox") {
      const target = path.join(root, "inbox", "_imported", record.relative);
      await mkdir(path.dirname(target), { recursive: true });
      await rename(record.file, target);
    }
  }
}

async function registerPdf(file, originalName) {
  const cached = pdfRegistry.get(file);
  if (cached) return cached;
  if (skippedLargePdf.has(file)) return null;

  const fileStat = await stat(file);

  if (fileStat.size > maxPdfBytes) {
    skippedLargePdf.add(file);
    stats.largePdf.push({ file: path.basename(file), mb: Number((fileStat.size / 1024 / 1024).toFixed(1)) });
    return null;
  }

  const name = path.basename(file, path.extname(file));
  const slug = docSlugFor(name);
  const href = `/files/${slug}.pdf`;
  const info = { slug, href };
  pdfRegistry.set(file, info);

  if (dryRun) {
    stats.pdfs += 1;
    return info;
  }

  const dest = path.join(outFiles, `${slug}.pdf`);
  if (!existsSync(dest)) await copyFile(file, dest);
  stats.pdfs += 1;

  const docPath = path.join(outLibrary, `${slug}.md`);
  if (!existsSync(docPath) || args.force) {
    const frontmatter = buildFrontmatter({
      title: name,
      description: "",
      date: fileStat.mtime,
      category: defaultCategory || "资料",
      tags: extraTags,
      extra: [`file: ${JSON.stringify(href)}`, `bytes: ${fileStat.size}`]
    });
    await writeFile(docPath, frontmatter, "utf8");
  }

  return info;
}

function isNumeric(value) {
  return /^\d+$/.test(String(value ?? "").trim());
}

async function walk(directory) {
  const result = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "_imported") continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walk(full)));
    } else if (entry.isFile()) {
      const extension = path.extname(entry.name).toLowerCase();
      if (
        extension === ".md" ||
        IMAGE_EXTENSIONS.has(extension) ||
        PDF_EXTENSIONS.has(extension) ||
        [".docx", ".zip", ".json", ".txt", ".csv"].includes(extension)
      ) {
        result.push(full);
      }
    }
  }

  return result;
}

function printReport() {
  const unresolved = stats.unresolved.slice(0, 20);
  console.log("");
  console.log(dryRun ? "=== 导入预演（未写入任何文件）===" : "=== 导入完成 ===");
  console.log(`来源：${source}`);
  console.log(`模式：${mode}`);
  console.log(`笔记：${stats.notes} 篇（跳过已存在 ${stats.skippedNotes} 篇）`);
  console.log(`图片：${stats.images} 处引用`);
  console.log(`PDF：${stats.pdfs} 份`);
  console.log(`其他附件：${stats.files} 份`);
  if (stats.largePdf.length) {
    console.log(`跳过的大 PDF：${stats.largePdf.length} 份`);
    for (const item of stats.largePdf.slice(0, 5)) console.log(`  - ${item.file} (${item.mb} MB)`);
  }
  if (stats.unresolved.length) {
    console.log(`未解析链接：${stats.unresolved.length} 个`);
    for (const item of unresolved) console.log(`  - ${item.type}: ${item.target}`);
  }
  if (stats.errors.length) {
    console.log(`失败：${stats.errors.length} 篇`);
    for (const item of stats.errors) console.log(`  - ${item.file}: ${item.message}`);
  }
  if (!dryRun) {
    console.log("");
    console.log("已写入：");
    for (const item of stats.written.slice(0, 10)) console.log(`  - ${item.output}`);
    if (stats.written.length > 10) console.log(`  … 共 ${stats.written.length} 篇`);
    console.log("报告：import-report.json");
    console.log("下一步：npm run build");
  }
}
