import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();

const ensure = async (dir) => {
  await mkdir(dir, { recursive: true });
};

const makeDiagram = async () => {
  const dir = path.join(root, "src", "content", "posts", "assets");
  await ensure(dir);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
      <rect width="1200" height="760" fill="#edf1e8"/>
      <rect x="70" y="70" width="1060" height="620" fill="#f8faf4" stroke="#0b1a14" stroke-width="2"/>
      <circle cx="250" cy="250" r="78" fill="#d5ff45" stroke="#0b1a14" stroke-width="2"/>
      <rect x="420" y="180" width="220" height="140" fill="#a9d4ff" stroke="#0b1a14" stroke-width="2"/>
      <path d="M700 250 L980 250" stroke="#0b1a14" stroke-width="3"/>
      <path d="M940 215 L990 250 L940 285" fill="none" stroke="#0b1a14" stroke-width="3"/>
      <text x="185" y="260" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#0b1a14">Note</text>
      <text x="455" y="260" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#0b1a14">Image</text>
      <text x="430" y="420" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#24372f">Markdown -&gt; Astro -&gt; Static site</text>
      <text x="430" y="470" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#5d6c64">A simple demo image for the blog pipeline.</text>
      <rect x="430" y="520" width="420" height="90" fill="#ff6948" opacity="0.18" stroke="#0b1a14" stroke-width="2"/>
      <text x="455" y="577" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#0b1a14">PDF / images / math</text>
    </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(path.join(dir, "demo-diagram.png"));
  console.log("wrote", path.join(dir, "demo-diagram.png"));
};

const pdfEscape = (value) => value.replace(/([\\()])/g, "\\$1");

const makePdf = async () => {
  const dir = path.join(root, "public", "files");
  await ensure(dir);

  const pages = [
    {
      lines: [
        "Demo Study Notes",
        "",
        "This PDF exists so the library page can be verified.",
        "Open /library and click the document to view it here.",
        "",
        "Page 1 of 2"
      ]
    },
    {
      lines: ["Second page", "", "This page is used by #page=2 deep links.", "", "Page 2 of 2"]
    }
  ];

  const objects = [];
  const pageObjectIds = pages.map((_, index) => 3 + index * 3);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;

  let nextId = 3;
  pages.forEach((page, index) => {
    const pageId = nextId++;
    const contentId = nextId++;
    const fontId = nextId++;

    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

    const lines = page.lines
      .map((line, lineIndex) => {
        if (!line) return "";
        return `BT /F1 ${lineIndex === 0 ? 24 : 13} Tf 72 ${760 - lineIndex * 28} Td (${pdfEscape(line)}) Tj ET`;
      })
      .filter(Boolean)
      .join("\n");

    objects[contentId] = `<< /Length ${Buffer.byteLength(lines, "binary")} >>\nstream\n${lines}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "binary");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const file = path.join(dir, "demo-study-notes.pdf");
  await writeFile(file, Buffer.from(pdf, "binary"));
  console.log("wrote", file, `${(Buffer.byteLength(pdf, "binary") / 1024).toFixed(1)} KB`);
};

await makeDiagram();
await makePdf();
