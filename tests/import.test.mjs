import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildFrontmatter,
  convertCallouts,
  convertObsidianLinks,
  deriveDescription,
  firstHeading,
  removeFirstHeading,
  splitTags,
  stripComments,
  toSlug
} from "../scripts/import-lib.mjs";

const projectRoot = process.cwd();
const vault = path.join(projectRoot, "fixtures", "obsidian-vault");

test("slug keeps Chinese and strips unsafe characters", () => {
  assert.equal(toSlug("02-极限的概念"), "02-极限的概念");
  assert.equal(toSlug("a/b:c*d"), "a-b-c-d");
  assert.equal(toSlug("   "), "note");
});

test("tags accept arrays and comma strings", () => {
  assert.deepEqual(splitTags(["微积分", " 极限 "]), ["微积分", "极限"]);
  assert.deepEqual(splitTags("微积分, 极限　连续"), ["微积分", "极限", "连续"]);
  assert.deepEqual(splitTags(undefined), []);
});

test("title, description and headings are derived", () => {
  const source = "# 标题\n\n这是第一段 **说明**。\n";
  assert.equal(firstHeading(source), "标题");
  assert.equal(removeFirstHeading(source).trim(), "这是第一段 **说明**。");
  assert.match(deriveDescription(source), /第一段/);
});

test("comments and callouts are flattened", () => {
  const source = "%% hidden %%\n> [!quote]- 原页核对\n> 内容\n";
  const cleaned = convertCallouts(stripComments(source));
  assert.equal(cleaned.includes("hidden"), false);
  assert.equal(cleaned.includes("> **原页核对**"), true);
  assert.equal(cleaned.includes("[!quote]"), false);
});

test("wiki links and embeds dispatch to the right handler", async () => {
  const calls = [];
  const result = await convertObsidianLinks(
    "看图 ![[a.png|300]]，资料 [[b.pdf#page=3|第 3 页]]，笔记 [[c|别名]]。",
    {
      image: async (args) => {
        calls.push(["image", args]);
        return "![a](a.webp)";
      },
      pdf: async (args) => {
        calls.push(["pdf", args]);
        return "[/library/b#page=3](/library/b#page=3)";
      },
      file: async () => "file",
      note: async (args) => {
        calls.push(["note", args]);
        return "[别名](/notes/c)";
      }
    }
  );

  assert.equal(calls[0][0], "image");
  assert.equal(calls[1][0], "pdf");
  assert.equal(calls[1][1].page, "3");
  assert.equal(calls[2][0], "note");
  assert.match(result, /a\.webp/);
  assert.match(result, /#page=3/);
});

test("frontmatter is valid YAML for gray-matter", async () => {
  const matter = (await import("gray-matter")).default;
  const output = buildFrontmatter({
    title: '标题 "含引号"',
    description: "摘要",
    date: new Date("2026-10-26T12:00:00"),
    category: "方法",
    tags: ["学习", "复盘"]
  });
  const parsed = matter(`${output}\n正文`);

  assert.equal(parsed.data.title, '标题 "含引号"');
  assert.equal(parsed.data.category, "方法");
  assert.deepEqual(parsed.data.tags, ["学习", "复盘"]);
  assert.equal(parsed.content.trim(), "正文");
});

test("imports a fixture vault into a temp root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "blog-import-"));

  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/import-content.mjs", "--vault", vault, "--root", root],
      { cwd: projectRoot, encoding: "utf8" }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const postsDir = path.join(root, "src", "content", "posts");
    const posts = readdirSync(postsDir).filter((name) => name.endsWith(".md"));
    assert.equal(posts.length, 2);

    const noteFile = posts.find((name) => name.includes("示例笔记"));
    assert.ok(noteFile, `posts: ${posts.join(", ")}`);
    const note = readFileSync(path.join(postsDir, noteFile), "utf8");

    assert.doesNotMatch(note, /\[\[!\[/);
    assert.doesNotMatch(note, /%%/);
    assert.match(note, /!\[[^\]]*\]\(\.\.\/\.\.\/assets\/imported\/[a-f0-9]+\.webp\)/);
    assert.match(note, /\/library\/讲义#page=2/);
    assert.match(note, /\/notes\/另一篇/);
    assert.match(note, /> \*\*原页核对\*\*/);

    const libraryFile = path.join(root, "src", "content", "library", "讲义.md");
    assert.ok(existsSync(libraryFile));
    assert.match(readFileSync(libraryFile, "utf8"), /file: "\/files\/讲义\.pdf"/);

    assert.ok(existsSync(path.join(root, "public", "files", "讲义.pdf")));
    assert.ok(existsSync(path.join(root, "import-report.json")));

    const assets = readdirSync(path.join(root, "src", "assets", "imported"));
    assert.ok(assets.some((name) => name.endsWith(".webp")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dry run writes nothing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "blog-dry-"));

  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/import-content.mjs", "--vault", vault, "--root", root, "--dry-run"],
      { cwd: projectRoot, encoding: "utf8" }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(existsSync(path.join(root, "src")), false);
    assert.equal(existsSync(path.join(root, "public")), false);
    assert.equal(existsSync(path.join(root, "import-report.json")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("importing the same vault twice does not create duplicates", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "blog-idempotent-"));

  try {
    for (let round = 0; round < 2; round += 1) {
      const result = spawnSync(
        process.execPath,
        ["scripts/import-content.mjs", "--vault", vault, "--root", root],
        { cwd: projectRoot, encoding: "utf8" }
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);

      if (round === 1) {
        assert.match(result.stdout, /跳过已存在 2 篇/);
      }
    }

    const posts = readdirSync(path.join(root, "src", "content", "posts")).filter((name) =>
      name.endsWith(".md")
    );
    assert.equal(posts.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
