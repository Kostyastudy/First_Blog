import katex from "katex";

const isMathClass = (node) => {
  const classes = node?.properties?.className;
  if (!Array.isArray(classes)) return null;
  if (classes.includes("math-display")) return "display";
  if (classes.includes("math-inline")) return "inline";
  return null;
};

/**
 * Sätteri parses `$...$` / `$$...$$` into `<code class="language-math math-inline">`
 * and `<pre><code class="language-math math-display">`. This visitor swaps them
 * for KaTeX output so a bad formula never breaks the build.
 */
export const katexPlugin = {
  name: "blog-katex",
  element: {
    filter: ["code"],
    visit(node, ctx) {
      const mode = isMathClass(node);
      if (!mode) return;

      const tex = ctx.textContent(node).trim();
      if (!tex) return;

      let html;
      try {
        html = katex.renderToString(tex, {
          displayMode: mode === "display",
          throwOnError: false,
          strict: "ignore",
          output: "html"
        });
      } catch {
        return;
      }

      if (mode === "display") {
        const parent = ctx.parent(node);
        if (parent && parent.type === "element" && parent.tagName === "pre") {
          ctx.replaceNode(parent, { type: "raw", value: html });
          return;
        }
      }

      return { type: "raw", value: html };
    }
  }
};
