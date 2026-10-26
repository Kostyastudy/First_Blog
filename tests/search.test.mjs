import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeHtml,
  makeSnippet,
  parseTerms,
  scoreEntry,
  searchEntries
} from "../src/utils/search.js";

const entry = {
  title: "极限的概念",
  description: "从数列到函数的极限定义",
  tags: ["微积分", "第一章"],
  text: "精度可以任意要求，而足够靠后的所有值都满足要求。"
};

test("normalizes and splits query terms", () => {
  assert.deepEqual(parseTerms("  极限   微积分 "), ["极限", "微积分"]);
});

test("scores title above body and rejects partial misses", () => {
  assert.ok(scoreEntry(entry, ["极限"]) > scoreEntry(entry, ["精度"]));
  assert.equal(scoreEntry(entry, ["极限", "线性代数"]), 0);
});

test("snippet highlights all terms and escapes html", () => {
  const snippet = makeSnippet("<script>x</script> 极限的定义", ["极限"]);
  assert.match(snippet, /<mark>极限<\/mark>/);
  assert.equal(snippet.includes("<script>"), false);
  assert.match(snippet, /&lt;script&gt;/);
});

test("escapeHtml covers quotes and ampersands", () => {
  assert.equal(escapeHtml('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");
});

test("searchEntries ranks title matches first", () => {
  const other = { ...entry, title: "数列", text: "极限在正文里出现" };
  const results = searchEntries([other, entry], "极限");
  assert.equal(results[0].title, "极限的概念");
});
