import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import matter from "gray-matter";
import { markdownToHtml } from "satteri";
import { katexPlugin } from "../src/plugins/katex.mjs";
import { buildFrontmatter, splitTags, toSlug } from "./import-lib.mjs";

const root = process.cwd();
const adminDir = path.join(root, "admin");
const postsDir = path.join(root, "src", "content", "posts");
const libraryDir = path.join(root, "src", "content", "library");
const filesDir = path.join(root, "public", "files");
const inboxDir = path.join(root, "inbox");
const configPath = path.join(root, "src", "config.ts");
const port = Number(process.env.ADMIN_PORT || 4322);
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
        tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
        pubDate: String(parsed.data.pubDate ?? "").slice(0, 10),
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
    tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
    pubDate: String(parsed.data.pubDate ?? "").slice(0, 10),
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
    tags: splitTags(payload.tags),
    extra: [`updatedDate: ${today()}`]
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
        tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
        bytes: Number(parsed.data.bytes ?? 0),
        pubDate: String(parsed.data.pubDate ?? "").slice(0, 10)
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

    log(`$ git push`);
    code = await runCommand("git", ["push"], log);
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

  if (extension === ".md") {
    const slug = await uniqueSlug(name.replace(/\.md$/i, ""), inboxDir);
    const target = path.join(inboxDir, `${slug}.md`);
    await writeFile(target, await readBody(req, maxUpload));
    sendJson(res, 200, { kind: "inbox", file: `inbox/${slug}.md` });
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
  const tags = splitTags(url.searchParams.get("tags") || "");

  const frontmatter = buildFrontmatter({
    title,
    description: String(url.searchParams.get("description") || ""),
    date: today(),
    category,
    tags,
    extra: [`file: ${JSON.stringify(fileUrl)}`, `bytes: ${size}`]
  });

  await writeFile(path.join(libraryDir, `${baseSlug}.md`), `${frontmatter}上传于写作台，可在资料库中下载。\n`, "utf8");
  sendJson(res, 200, { kind: "library", id: baseSlug, title, file: fileUrl, bytes: size });
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;

  if (req.method === "GET" && pathname === "/api/summary") {
    const [posts, docs, config] = await Promise.all([listPosts(), listLibrary(), readConfig()]);
    sendJson(res, 200, {
      posts: posts.length,
      docs: docs.length,
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
  if (process.env.NO_OPEN !== "1") {
    spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  }
});
