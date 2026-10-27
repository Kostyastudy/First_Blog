import http from "node:http";
import net from "node:net";
import os from "node:os";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import matter from "gray-matter";
import { markdownToHtml } from "satteri";
import { katexPlugin } from "../src/plugins/katex.mjs";
import {
  buildFrontmatter,
  convertCallouts,
  convertObsidianLinks,
  firstHeading,
  splitTags,
  stripComments,
  toSlug
} from "./import-lib.mjs";

const root = process.cwd();
const adminDir = path.join(root, "admin");
const postsDir = path.join(root, "src", "content", "posts");
const libraryDir = path.join(root, "src", "content", "library");
const pagesDir = path.join(root, "src", "content", "pages");
const filesDir = path.join(root, "public", "files");
const inboxDir = path.join(root, "inbox");
const configPath = path.join(root, "src", "config.ts");
const foldersPath = path.join(root, "src", "data", "folders.json");
const aboutPath = path.join(pagesDir, "about.md");
const port = Number(process.env.ADMIN_PORT || 4322);
const sitePort = 4321;
const maxUpload = 50 * 1024 * 1024;

const jobStore = new Map();

const sendJson = (res, status, data) => {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
};

const readBody = (req, limit = 1024 * 1024) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

const safeId = (value) => path.basename(String(value ?? "")).replace(/\.md$/i, "");

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const dateOnly = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.valueOf()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
};
async function listPosts() {
  const names = (await readdir(postsDir)).filter((name) => name.endsWith(".md"));
  const posts = [];

  for (const name of names) {
    try {
      const raw = await readFile(path.join(postsDir, name), "utf8");
      const parsed = matter(raw);
      posts.push({
        id: name.replace(/\.md$/, ""),
        title: String(parsed.data.title ?? name),
        description: String(parsed.data.description ?? ""),
        category: String(parsed.data.category ?? ""),
        folder: String(parsed.data.folder ?? ""),
        kind: parsed.data.kind === "material" ? "material" : "note",
        tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
        pubDate: dateOnly(parsed.data.pubDate),
        draft: Boolean(parsed.data.draft)
      });
    } catch {
      // ignore a single malformed file so the admin still boots
    }
  }

  return posts.sort((a, b) => String(b.pubDate).localeCompare(String(a.pubDate)));
}

async function getPost(id) {
  const file = path.join(postsDir, `${safeId(id)}.md`);
  const parsed = matter(await readFile(file, "utf8"));
  return {
    id: safeId(id),
    title: String(parsed.data.title ?? ""),
    description: String(parsed.data.description ?? ""),
    category: String(parsed.data.category ?? ""),
    folder: String(parsed.data.folder ?? ""),
    kind: parsed.data.kind === "material" ? "material" : "note",
    tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
    pubDate: dateOnly(parsed.data.pubDate),
    body: parsed.content.replace(/^\n+/, "")
  };
}

async function uniqueSlug(base, dir, extension = ".md") {
  let slug = toSlug(base, "post");
  let index = 2;
  while (existsSync(path.join(dir, `${slug}${extension}`))) {
    slug = `${toSlug(base, "post")}-${index}`;
    index += 1;
  }
  return slug;
}

async function savePost(payload) {
  const title = String(payload.title ?? "").trim();
  if (!title) throw new Error("标题不能为空");

  const id = payload.id ? safeId(payload.id) : await uniqueSlug(title, postsDir);
  const frontmatter = buildFrontmatter({
    title,
    description: String(payload.description ?? ""),
    date: payload.pubDate || today(),
    category: String(payload.category || "笔记"),
    folder: String(payload.folder || "其他"),
    kind: "note",
    tags: splitTags(payload.tags),
    extra: [
      `folder: ${JSON.stringify(String(payload.folder || "其他"))}`,
      `updatedDate: ${today()}`
    ]
  });

  await writeFile(path.join(postsDir, `${id}.md`), `${frontmatter}${String(payload.body ?? "").trim()}\n`, "utf8");
  return { id };
}

async function listLibrary() {
  const names = (await readdir(libraryDir)).filter((name) => name.endsWith(".md"));
  const docs = [];

  for (const name of names) {
    try {
      const parsed = matter(await readFile(path.join(libraryDir, name), "utf8"));
      docs.push({
        id: name.replace(/\.md$/, ""),
        title: String(parsed.data.title ?? name),
        description: String(parsed.data.description ?? ""),
        file: String(parsed.data.file ?? ""),
        category: String(parsed.data.category ?? ""),
        folder: String(parsed.data.folder ?? ""),
        kind: parsed.data.kind === "note" ? "note" : "material",
        tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
        bytes: Number(parsed.data.bytes ?? 0),
        pubDate: dateOnly(parsed.data.pubDate)
      });
    } catch {
      // ignore
    }
  }

  return docs.sort((a, b) => String(b.pubDate).localeCompare(String(a.pubDate)));
}

async function readConfig() {
  const text = await readFile(configPath, "utf8");
  const stringField = (key) => {
    const match = text.match(new RegExp(`${key}:\\s*("(?:[^"\\\\]|\\\\.)*")`));
    return match ? JSON.parse(match[1]) : "";
  };
  const yearMatch = text.match(/startYear:\s*(\d+)/);

  return {
    name: stringField("name"),
    latinName: stringField("latinName"),
    title: stringField("title"),
    description: stringField("description"),
    homeIntro: stringField("homeIntro"),
    heroTitle: stringField("heroTitle"),
    heroSubtitle: stringField("heroSubtitle"),
    footerNote: stringField("footerNote"),
    author: stringField("author"),
    email: stringField("email"),
    startYear: yearMatch ? Number(yearMatch[1]) : new Date().getFullYear()
  };
}

async function writeConfig(patch) {
  let text = await readFile(configPath, "utf8");
  const stringKeys = [
    "name",
    "latinName",
    "title",
    "description",
    "homeIntro",
    "heroTitle",
    "heroSubtitle",
    "footerNote",
    "author",
    "email"
  ];

  for (const key of stringKeys) {
    if (!(key in patch)) continue;
    const regex = new RegExp(`(${key}:\\s*)("(?:[^"\\\\]|\\\\.)*")`);
    if (regex.test(text)) {
      text = text.replace(regex, `$1${JSON.stringify(String(patch[key]))}`);
    }
  }

  if ("startYear" in patch) {
    text = text.replace(/(startYear:\s*)\d+/, `$1${Number(patch.startYear) || new Date().getFullYear()}`);
  }

  await writeFile(configPath, text, "utf8");
}

async function readFolders() {
  try {
    const text = (await readFile(foldersPath, "utf8")).replace(/^\uFEFF/, "");
    const list = JSON.parse(text);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeFolders(list) {
  await writeFile(foldersPath, JSON.stringify([...new Set(list)], null, 2), "utf8");
}

async function createFolder(name) {
  const folders = await readFolders();
  const trimmed = String(name ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!trimmed) throw new Error("文件夹名称不能为空");
  if (trimmed.split("/").some((part) => !part.trim())) throw new Error("文件夹名称不合法");
  if (folders.includes(trimmed)) throw new Error("文件夹已存在");
  folders.push(trimmed);
  await writeFolders(folders);
  return folders;
}

async function deleteFolder(name) {
  const [posts, docs, folders] = await Promise.all([listPosts(), listLibrary(), readFolders()]);
  const used = [...posts, ...docs].some(
    (item) => item.folder === name || item.folder.startsWith(`${name}/`)
  );
  const hasChildren = folders.some((folder) => folder.startsWith(`${name}/`));
  if (used) throw new Error("文件夹里还有内容，先把条目移到其他文件夹");
  if (hasChildren) throw new Error("还有子文件夹，先删除子文件夹");
  await writeFolders(folders.filter((folder) => folder !== name));
  return readFolders();
}

async function moveItem(kind, id, folder) {
  const dir = kind === "note" ? postsDir : libraryDir;
  const file = path.join(dir, `${safeId(id)}.md`);
  let text = await readFile(file, "utf8");
  const target = String(folder || "其他");

  if (/^folder:\s*.*$/m.test(text)) {
    text = text.replace(/^folder:\s*.*$/m, `folder: ${JSON.stringify(target)}`);
  } else if (/^category:.*$/m.test(text)) {
    text = text.replace(/^(category:.*)$/m, `$1\nfolder: ${JSON.stringify(target)}`);
  }

  await writeFile(file, text, "utf8");
}

async function readAbout() {
  const parsed = matter(await readFile(aboutPath, "utf8"));
  return {
    title: String(parsed.data.title ?? "关于"),
    description: String(parsed.data.description ?? ""),
    links: Array.isArray(parsed.data.links) ? parsed.data.links : [],
    body: parsed.content.replace(/^\n+/, "")
  };
}

async function saveAbout(payload) {
  const links = Array.isArray(payload.links)
    ? payload.links
        .map((link) => ({
          label: String(link.label ?? "").trim(),
          url: String(link.url ?? "").trim(),
          type: link.type === "text" ? "text" : "link"
        }))
        .filter((link) => link.label && link.url)
    : [];

  const content = matter.stringify(String(payload.body ?? "").trim() + "\n", {
    title: String(payload.title || "关于"),
    description: String(payload.description || ""),
    links
  });

  await mkdir(pagesDir, { recursive: true });
  await writeFile(aboutPath, content, "utf8");
}

const portOpen = (value) =>
  new Promise((resolve) => {
    const socket = net.connect({ port: value, host: "127.0.0.1" });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(700, () => done(false));
  });

let devProcess = null;

async function ensureDevServer() {
  if (await portOpen(sitePort)) return "already-running";
  devProcess = spawn("npm", ["run", "dev"], {
    cwd: root,
    shell: true,
    windowsHide: true,
    stdio: "ignore",
    detached: false
  });

  for (let index = 0; index < 40; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await portOpen(sitePort)) return "started";
  }

  return "starting";
}

async function stopDevServer() {
  if (!devProcess) return;
  const pid = devProcess.pid;
  devProcess = null;
  if (!pid) return;
  await new Promise((resolve) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
      shell: true
    });
    killer.on("close", resolve);
    killer.on("error", resolve);
  });
}

const runCommand = (command, args, onLine) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, windowsHide: true, shell: true });
    const forward = (chunk, stream) => {
      const text = chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) onLine(`[${stream}] ${line}`);
      }
    };
    child.stdout.on("data", (chunk) => forward(chunk, "out"));
    child.stderr.on("data", (chunk) => forward(chunk, "err"));
    child.on("close", (code) => resolve(code ?? 1));
  });

function startJob(action) {
  const id = randomUUID();
  const job = { id, action, status: "running", logs: [], exitCode: null, startedAt: Date.now() };
  jobStore.set(id, job);

  const log = (line) => {
    job.logs.push(line);
    if (job.logs.length > 800) job.logs.shift();
  };

  const deploy = async () => {
    log(`$ npm run build`);
    let code = await runCommand("npm", ["run", "build"], log);
    if (code !== 0) throw new Error(`构建失败（exit ${code}）`);

    log(`$ git add -A`);
    code = await runCommand("git", ["add", "-A"], log);
    if (code !== 0) throw new Error(`git add 失败（exit ${code}）`);

    const diffCode = await runCommand("git", ["diff", "--cached", "--quiet"], () => {});
    if (diffCode === 0) {
      log("没有需要提交的更改，跳过 commit 和 push。");
      return;
    }

    log(`$ git commit`);
    code = await runCommand("git", ["commit", "-m", `content-update-from-admin-${today()}`], log);
    if (code !== 0) throw new Error(`git commit 失败（exit ${code}）`);

    code = 1;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      log(`$ git push${attempt > 1 ? `（第 ${attempt} 次尝试）` : ""}`);
      code = await runCommand("git", ["push"], log);
      if (code === 0) break;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    if (code !== 0) throw new Error(`git push 失败（exit ${code}）。请确认 Clash 已开启。`);
    log("已推送，Vercel 正在自动部署（约 1–2 分钟）。");
  };

  const importInbox = async () => {
    log(`$ npm run import`);
    const code = await runCommand("npm", ["run", "import"], log);
    if (code !== 0) throw new Error(`导入失败（exit ${code}）`);
  };

  (async () => {
    try {
      if (action === "deploy") await deploy();
      else if (action === "build") {
        log(`$ npm run build`);
        const code = await runCommand("npm", ["run", "build"], log);
        if (code !== 0) throw new Error(`构建失败（exit ${code}）`);
      } else if (action === "import") await importInbox();
      else throw new Error("未知操作");

      job.status = "success";
      log("完成。");
    } catch (error) {
      job.status = "failed";
      log(`失败：${error.message}`);
    } finally {
      job.exitCode = job.status === "success" ? 0 : 1;
    }
  })();

  return job;
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".png": "image/png"
};

async function serveFile(res, filePath) {
  if (!existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const info = await stat(filePath);
  if (info.isDirectory()) {
    res.writeHead(404).end("Not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(res);
}

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]);

const cleanImageTarget = (value) => {
  let target = String(value ?? "").trim().replace(/^<|>$/g, "");
  target = target.split(/\s+/)[0].split("#")[0].split("?")[0];
  try {
    target = decodeURIComponent(target);
  } catch {
    // keep the original target when it is not valid percent-encoding
  }
  return target.trim();
};

const extractImageRefs = (markdown) => {
  const refs = [];
  let match;
  const wiki = /!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
  while ((match = wiki.exec(markdown))) {
    refs.push({ raw: match[0], target: match[1], alt: match[2] || "", obsidian: true });
  }
  const standard = /!\[([^\]]*)\]\(([^)]+)\)/g;
  while ((match = standard.exec(markdown))) {
    refs.push({ raw: match[0], target: match[2], alt: match[1], obsidian: false });
  }

  return refs
    .map((ref) => ({ ...ref, target: cleanImageTarget(ref.target) }))
    .filter(
      (ref) =>
        ref.target &&
        !/^(https?:|data:)/i.test(ref.target) &&
        imageExtensions.has(path.extname(ref.target).toLowerCase())
    );
};

async function scanFolderNotes(directory) {
  const info = await stat(directory);
  if (!info.isDirectory()) throw new Error("路径不是文件夹");

  const files = await walkFiles(directory);
  const imageFiles = files.filter((file) => imageExtensions.has(path.extname(file.relative).toLowerCase()));
  const markdownFiles = files.filter((file) => file.relative.toLowerCase().endsWith(".md"));

  const byPath = new Map(imageFiles.map((file) => [file.relative.toLowerCase(), file.full]));
  const byBase = new Map();
  for (const file of imageFiles) {
    const base = path.basename(file.relative).toLowerCase();
    const list = byBase.get(base) ?? [];
    list.push(file.full);
    byBase.set(base, list);
  }

  const resolveImage = (mdFile, target) => {
    const direct = path.isAbsolute(target)
      ? target
      : path.resolve(path.dirname(mdFile.full), target);
    if (existsSync(direct)) return direct;

    const relative = path.relative(directory, direct).replaceAll("\\", "/").toLowerCase();
    if (byPath.has(relative)) return byPath.get(relative);

    return byBase.get(path.basename(target).toLowerCase())?.[0] ?? null;
  };

  const notes = [];
  for (const mdFile of markdownFiles) {
    const raw = await readFile(mdFile.full, "utf8");
    const parsed = matter(raw);
    const title = String(
      parsed.data.title || firstHeading(parsed.content) || path.basename(mdFile.relative, ".md")
    ).trim();
    const slug = toSlug(path.basename(mdFile.relative, path.extname(mdFile.relative)));
    const refs = extractImageRefs(parsed.content).map((ref) => ({
      ...ref,
      file: resolveImage(mdFile, ref.target)
    }));
    const missing = refs.filter((ref) => !ref.file).map((ref) => ref.target);

    notes.push({
      file: mdFile.full,
      relative: mdFile.relative,
      title,
      slug,
      imageCount: refs.length,
      missing,
      conflict: existsSync(path.join(postsDir, `${slug}.md`)),
      refs
    });
  }

  return { directory, imageCount: imageFiles.length, notes };
}

async function importFolderNotes(directory, folder, overwrite) {
  const scan = await scanFolderNotes(directory);
  const imported = [];

  for (const note of scan.notes) {
    const raw = await readFile(note.file, "utf8");
    const parsed = matter(raw);
    const existing = existsSync(path.join(postsDir, `${note.slug}.md`));
    const slug = overwrite
      ? note.slug
      : await uniqueSlug(path.basename(note.file, path.extname(note.file)), postsDir);
    const postDir = path.join(postsDir, slug);
    await mkdir(postDir, { recursive: true });

    const assetNames = new Map();
    const usedNames = new Set();
    let body = parsed.content;
    let copied = 0;

    for (const ref of note.refs) {
      if (!ref.file) continue;
      let name = path.basename(ref.file);
      const key = name.toLowerCase();
      if (usedNames.has(key)) {
        const extension = path.extname(name);
        name = `${path.basename(name, extension)}-${usedNames.size + 1}${extension}`;
      }
      usedNames.add(name.toLowerCase());

      let assetName = assetNames.get(ref.file);
      if (!assetName) {
        assetName = name;
        assetNames.set(ref.file, assetName);
        const destination = path.join(postDir, "assets", assetName);
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(ref.file, destination);
        copied += 1;
      }

      body = body.replaceAll(
        ref.raw,
        `![${ref.alt || assetName}](<assets/${assetName}>)`
      );
    }

    const output = matter.stringify(body.trim() + "\n", {
      ...parsed.data,
      title: note.title,
      folder,
      kind: "note",
      pubDate: parsed.data.pubDate || today(),
      category: parsed.data.category || folder
    });

    await writeFile(path.join(postsDir, `${slug}.md`), output, "utf8");
    imported.push({
      id: slug,
      title: note.title,
      images: copied,
      missing: note.missing,
      overwritten: existing && overwrite
    });
  }

  return imported;
}

async function walkFiles(directory, base = directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".DS_Store", "node_modules", ".git", ".obsidian"].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walkFiles(full, base)));
    } else if (entry.isFile()) {
      result.push({ full, relative: path.relative(base, full).replaceAll("\\", "/") });
    }
  }
  return result;
}

async function handleNoteBundle(req, res, url, folder) {
  const buffer = await readBody(req, maxUpload);
  const temp = await mkdtemp(path.join(os.tmpdir(), "dsh-note-bundle-"));

  try {
    const zip = new AdmZip(buffer);
    zip.extractAllTo(temp, true);

    const files = await walkFiles(temp);
    const mdFiles = files.filter((file) => file.relative.toLowerCase().endsWith(".md"));
    if (mdFiles.length === 0) {
      sendJson(res, 400, { error: "压缩包里没有 .md 文件" });
      return;
    }

    const mdFile = mdFiles[0];
    const mdDir = path.dirname(mdFile.full);
    const parsed = matter(await readFile(mdFile.full, "utf8"));
    const baseName = path.basename(mdFile.relative, path.extname(mdFile.relative));
    const title = String(parsed.data.title || firstHeading(parsed.content) || baseName).trim();
    const slugBase = /^(note|index|readme)$/i.test(baseName) ? title : baseName;
    const slug = await uniqueSlug(slugBase, postsDir);
    const postDir = path.join(postsDir, slug);
    await mkdir(postDir, { recursive: true });

    // Keep the Markdown writer's relative image paths working.
    for (const file of await walkFiles(mdDir)) {
      if (file.relative.toLowerCase().endsWith(".md")) continue;
      const target = path.join(postDir, file.relative);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(file.full, target);
    }

    const findAsset = (target) => {
      const normalized = target.replaceAll("\\", "/").toLowerCase();
      return (
        files.find((file) => file.relative.toLowerCase() === normalized) ??
        files.find((file) => path.basename(file.relative).toLowerCase() === path.basename(normalized)) ??
        null
      );
    };

    let body = stripComments(parsed.content);
    body = convertCallouts(body);
    body = await convertObsidianLinks(body, {
      image: async ({ target, label }) => {
        const asset = findAsset(target);
        if (!asset) return label || target;

        const name = path.basename(asset.relative);
        const destination = path.join(postDir, "assets", name);
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(asset.full, destination);

        const alt = label && !/^\d+$/.test(label) ? label : name;
        return `![${alt}](<assets/${name}>)`;
      },
      pdf: async ({ target, label }) => label || target,
      file: async ({ target, label }) => label || target,
      note: async ({ target, label }) => label || target
    });

    const output = matter.stringify(body.trim() + "\n", {
      ...parsed.data,
      title,
      folder,
      kind: "note",
      pubDate: parsed.data.pubDate || today(),
      category: parsed.data.category || folder
    });

    await writeFile(path.join(postsDir, `${slug}.md`), output, "utf8");
    sendJson(res, 200, {
      kind: "bundle",
      id: slug,
      title,
      folder,
      ignoredNotes: mdFiles.length - 1
    });
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleUpload(req, res, url) {
  const rawName = String(url.searchParams.get("name") || "upload.bin");
  const name = path.basename(rawName);
  const extension = path.extname(name).toLowerCase();
  const allowed = new Set([".pdf", ".docx", ".doc", ".pptx", ".ppt", ".zip", ".md"]);

  if (!allowed.has(extension)) {
    sendJson(res, 400, { error: "只支持 PDF、Word、PPT、ZIP、Markdown 文件" });
    return;
  }

  const declared = Number(req.headers["content-length"] || 0);
  if (declared > maxUpload) {
    sendJson(res, 413, { error: "文件超过 50MB，已拒绝上传" });
    return;
  }

  await mkdir(filesDir, { recursive: true });
  await mkdir(inboxDir, { recursive: true });

  const folder = String(url.searchParams.get("folder") || "其他").trim();

  if (extension === ".zip" && url.searchParams.get("bundle") === "1") {
    await handleNoteBundle(req, res, url, folder);
    return;
  }

  if (extension === ".md") {
    const raw = (await readBody(req, maxUpload)).toString("utf8");
    const parsed = matter(raw);
    const fallbackTitle = name.replace(/\.md$/i, "");
    const title = String(parsed.data.title || firstHeading(parsed.content) || fallbackTitle).trim();
    const slug = await uniqueSlug(fallbackTitle, postsDir);
    const output = matter.stringify(parsed.content.replace(/^\n+/, ""), {
      ...parsed.data,
      title,
      folder,
      kind: "note",
      pubDate: parsed.data.pubDate || today(),
      category: parsed.data.category || folder
    });

    await writeFile(path.join(postsDir, `${slug}.md`), output, "utf8");
    sendJson(res, 200, { kind: "post", id: slug, folder, title });
    return;
  }

  const baseSlug = await uniqueSlug(name.replace(/\.[^.]+$/, ""), filesDir, extension);
  const target = path.join(filesDir, `${baseSlug}${extension}`);
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxUpload) {
      sendJson(res, 413, { error: "文件超过 50MB，已拒绝上传" });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  }

  await writeFile(target, Buffer.concat(chunks));
  const fileUrl = `/files/${baseSlug}${extension}`;
  const title = String(url.searchParams.get("title") || name.replace(/\.[^.]+$/, "")).trim();
  const category = String(url.searchParams.get("category") || "资料").trim();
  const kind = url.searchParams.get("kind") === "note" ? "note" : "material";
  const tags = splitTags(url.searchParams.get("tags") || "");

  const frontmatter = buildFrontmatter({
    title,
    description: String(url.searchParams.get("description") || ""),
    date: today(),
    category,
    tags,
    extra: [
      `file: ${JSON.stringify(fileUrl)}`,
      `bytes: ${size}`,
      `folder: ${JSON.stringify(folder)}`,
      `kind: ${JSON.stringify(kind)}`
    ]
  });

  await writeFile(path.join(libraryDir, `${baseSlug}.md`), `${frontmatter}上传于写作台，可在资料库中下载。\n`, "utf8");
  sendJson(res, 200, { kind: "library", id: baseSlug, title, file: fileUrl, bytes: size });
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;

  if (req.method === "GET" && pathname === "/api/summary") {
    const [posts, docs, config, folders] = await Promise.all([
      listPosts(),
      listLibrary(),
      readConfig(),
      readFolders()
    ]);
    sendJson(res, 200, {
      posts: posts.length,
      docs: docs.length,
      folders,
      config,
      categories: [...new Set(posts.map((post) => post.category).filter(Boolean))]
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/posts") {
    sendJson(res, 200, await listPosts());
    return;
  }

  if (req.method === "GET" && pathname === "/api/post") {
    sendJson(res, 200, await getPost(searchParams.get("id")));
    return;
  }

  if (req.method === "POST" && pathname === "/api/post") {
    const payload = JSON.parse((await readBody(req)).toString("utf8"));
    sendJson(res, 200, await savePost(payload));
    return;
  }

  if (req.method === "DELETE" && pathname === "/api/post") {
    const id = safeId(searchParams.get("id"));
    await unlink(path.join(postsDir, `${id}.md`));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/library") {
    sendJson(res, 200, await listLibrary());
    return;
  }

  if (req.method === "DELETE" && pathname === "/api/library") {
    const id = safeId(searchParams.get("id"));
    const entryPath = path.join(libraryDir, `${id}.md`);
    if (existsSync(entryPath)) {
      const parsed = matter(await readFile(entryPath, "utf8"));
      const file = String(parsed.data.file || "");
      if (file.startsWith("/files/")) {
        await unlink(path.join(filesDir, path.basename(file))).catch(() => {});
      }
      await unlink(entryPath);
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/config") {
    sendJson(res, 200, await readConfig());
    return;
  }

  if (req.method === "PUT" && pathname === "/api/config") {
    const patch = JSON.parse((await readBody(req)).toString("utf8"));
    await writeConfig(patch);
    sendJson(res, 200, await readConfig());
    return;
  }

  if (req.method === "POST" && pathname === "/api/preview") {
    const { markdown } = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8"));
    const result = await markdownToHtml(String(markdown ?? ""), {
      features: { math: true, rawHtml: true },
      hastPlugins: [katexPlugin]
    });
    sendJson(res, 200, { html: result.html });
    return;
  }

  if (req.method === "POST" && pathname === "/api/job") {
    const { action } = JSON.parse((await readBody(req)).toString("utf8"));
    const job = startJob(String(action));
    sendJson(res, 200, { id: job.id });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/job/")) {
    const id = pathname.split("/").pop();
    const job = jobStore.get(id);
    if (!job) {
      sendJson(res, 404, { error: "job not found" });
      return;
    }
    const since = Number(searchParams.get("since") || 0);
    sendJson(res, 200, {
      status: job.status,
      logs: job.logs.slice(since),
      next: job.logs.length,
      exitCode: job.exitCode
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/folders") {
    sendJson(res, 200, await readFolders());
    return;
  }

  if (req.method === "POST" && pathname === "/api/folders") {
    const payload = JSON.parse((await readBody(req)).toString("utf8"));
    sendJson(res, 200, await createFolder(payload.name));
    return;
  }

  if (req.method === "DELETE" && pathname === "/api/folders") {
    sendJson(res, 200, await deleteFolder(String(searchParams.get("name") || "")));
    return;
  }

  if (req.method === "POST" && pathname === "/api/move") {
    const payload = JSON.parse((await readBody(req)).toString("utf8"));
    await moveItem(String(payload.kind), String(payload.id), String(payload.folder));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/about") {
    sendJson(res, 200, await readAbout());
    return;
  }

  if (req.method === "PUT" && pathname === "/api/about") {
    const payload = JSON.parse((await readBody(req)).toString("utf8"));
    await saveAbout(payload);
    sendJson(res, 200, await readAbout());
    return;
  }

  if (req.method === "GET" && pathname === "/api/dev") {
    sendJson(res, 200, { running: await portOpen(sitePort) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/dev") {
    const payload = JSON.parse((await readBody(req)).toString("utf8"));
    if (payload.action === "start") {
      sendJson(res, 200, { running: true, state: await ensureDevServer() });
      return;
    }
    await stopDevServer();
    sendJson(res, 200, { running: await portOpen(sitePort) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/folder-scan") {
    const payload = JSON.parse((await readBody(req)).toString("utf8"));
    const scan = await scanFolderNotes(String(payload.path || ""));
    sendJson(res, 200, {
      directory: scan.directory,
      imageCount: scan.imageCount,
      notes: scan.notes.map(({ file, refs, ...rest }) => rest)
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/folder-import") {
    const payload = JSON.parse((await readBody(req)).toString("utf8"));
    const imported = await importFolderNotes(
      String(payload.path || ""),
      String(payload.folder || "其他"),
      Boolean(payload.overwrite)
    );
    sendJson(res, 200, { imported });
    return;
  }

  sendJson(res, 404, { error: "not found" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  try {
    if (url.pathname === "/api/upload" && req.method === "POST") {
      await handleUpload(req, res, url);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (url.pathname.startsWith("/vendor/katex/")) {
      const relative = url.pathname.replace("/vendor/katex/", "");
      const file = path.resolve(root, "node_modules", "katex", "dist", relative);
      if (!file.startsWith(path.resolve(root, "node_modules", "katex", "dist"))) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      await serveFile(res, file);
      return;
    }

    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.resolve(adminDir, relative);
    if (!file.startsWith(adminDir)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    await serveFile(res, file);
  } catch (error) {
    if (res.headersSent) return;
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`写作台已启动：${url}`);
  ensureDevServer()
    .then((state) => console.log(`本地预览：${state === "already-running" ? "已在运行" : "已启动"}`))
    .catch((error) => console.error(`本地预览启动失败：${error.message}`));
  if (process.env.NO_OPEN !== "1") {
    spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  }
});

const shutdown = async () => {
  await stopDevServer();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
