export function normalizeText(value) {
  const text = String(value ?? "");
  return (text.normalize ? text.normalize("NFKC") : text).toLowerCase();
}

export function parseTerms(query) {
  return normalizeText(query).split(/\s+/).filter(Boolean);
}

function countOccurrences(text, term) {
  if (!term) return 0;
  let count = 0;
  let index = 0;
  while (count < 20) {
    index = text.indexOf(term, index);
    if (index === -1) break;
    count += 1;
    index += term.length;
  }
  return count;
}

export function scoreEntry(entry, terms) {
  if (!terms.length) return 0;

  const title = normalizeText(entry.title);
  const description = normalizeText(entry.description ?? "");
  const tags = normalizeText((entry.tags ?? []).join(" "));
  const text = normalizeText(entry.text ?? "");

  let score = 0;

  for (const term of terms) {
    const inTitle = title.includes(term);
    const inTags = tags.includes(term);
    const inDescription = description.includes(term);
    const inText = text.includes(term);

    if (!inTitle && !inTags && !inDescription && !inText) return 0;

    if (inTitle) score += 8;
    if (inTags) score += 4;
    if (inDescription) score += 2;
    if (inText) score += Math.min(countOccurrences(text, term), 10);
  }

  return score;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text, terms) {
  const pattern = terms.map(escapeRegExp).filter(Boolean).join("|");
  if (!pattern) return escapeHtml(text);

  const regex = new RegExp(pattern, "gi");
  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    result += escapeHtml(text.slice(lastIndex, match.index));
    result += `<mark>${escapeHtml(match[0])}</mark>`;
    lastIndex = match.index + match[0].length;
    if (match[0].length === 0) regex.lastIndex += 1;
  }

  return result + escapeHtml(text.slice(lastIndex));
}

export function makeSnippet(text, terms, radius = 60) {
  const source = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!source) return "";

  const lower = source.toLowerCase();
  let bestIndex = -1;
  let bestLength = 0;

  for (const term of terms) {
    const needle = term.toLowerCase();
    if (!needle) continue;
    const index = lower.indexOf(needle);
    if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
      bestLength = needle.length;
    }
  }

  if (bestIndex === -1) {
    const head = source.slice(0, radius * 2);
    return escapeHtml(head) + (source.length > head.length ? "…" : "");
  }

  const start = Math.max(0, bestIndex - radius);
  const end = Math.min(source.length, bestIndex + bestLength + radius);
  const snippet =
    (start > 0 ? "…" : "") + source.slice(start, end) + (end < source.length ? "…" : "");

  return highlight(snippet, terms);
}

export function searchEntries(entries, query, limit = 25) {
  const terms = parseTerms(query);
  if (!terms.length) return [];

  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || String(b.entry.date).localeCompare(String(a.entry.date)))
    .slice(0, limit)
    .map((item) => item.entry);
}
