import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const width = 1200;
const height = 1500;
const output = fileURLToPath(new URL("../public/images/growth-atlas.webp", import.meta.url));
const outputDirectory = fileURLToPath(new URL("../public/images/", import.meta.url));

const contourPaths = Array.from({ length: 13 }, (_, index) => {
  const offset = index * 78 - 170;
  return `
    <path
      d="M-80 ${520 + offset}
         C 210 ${355 + offset}, 325 ${680 + offset}, 640 ${530 + offset}
         S 1015 ${300 + offset}, 1290 ${500 + offset}"
      fill="none"
      stroke="#71827a"
      stroke-width="${index % 3 === 0 ? 3 : 1.5}"
      opacity="${index % 3 === 0 ? 0.52 : 0.32}"
    />
  `;
}).join("");

const dots = Array.from({ length: 18 }, (_, row) =>
  Array.from({ length: 13 }, (_, column) => {
    const x = 92 + column * 85;
    const y = 90 + row * 79;
    const node = (row === 8 && column === 2) || (row === 10 && column === 9);
    return `<circle cx="${x}" cy="${y}" r="${node ? 8 : 2.2}" fill="${node ? "#ff6948" : "#20352c"}" opacity="${node ? 1 : 0.23}"/>`;
  }).join("")
).join("");

const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f8faf4"/>
        <stop offset="1" stop-color="#dbe7dc"/>
      </linearGradient>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="3" seed="7"/>
        <feColorMatrix type="saturate" values="0"/>
        <feComponentTransfer>
          <feFuncA type="table" tableValues="0 0.06"/>
        </feComponentTransfer>
      </filter>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#paper)"/>
    <rect x="48" y="48" width="${width - 96}" height="${height - 96}" fill="none" stroke="#0b1a14" stroke-width="2" opacity="0.72"/>
    <rect x="82" y="1110" width="430" height="270" fill="#d5ff45" transform="rotate(-4 297 1245)"/>
    <rect x="658" y="430" width="330" height="410" fill="#a9d4ff" opacity="0.58"/>
    <rect x="202" y="316" width="246" height="246" fill="#ff6948" opacity="0.93" transform="rotate(8 325 439)"/>

    <g>${dots}</g>
    <g>${contourPaths}</g>

    <path
      d="M168 1265 C 264 1120, 188 914, 395 807 S 674 669, 615 466 S 770 211, 1046 206"
      fill="none"
      stroke="#0b1a14"
      stroke-width="26"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M168 1265 C 264 1120, 188 914, 395 807 S 674 669, 615 466 S 770 211, 1046 206"
      fill="none"
      stroke="#f8faf4"
      stroke-width="4"
      stroke-dasharray="4 22"
      stroke-linecap="round"
    />

    <circle cx="168" cy="1265" r="28" fill="#ff6948" stroke="#0b1a14" stroke-width="7"/>
    <circle cx="395" cy="807" r="20" fill="#d5ff45" stroke="#0b1a14" stroke-width="6"/>
    <circle cx="615" cy="466" r="23" fill="#a9d4ff" stroke="#0b1a14" stroke-width="6"/>
    <path d="M1008 148 L1060 206 L1038 274" fill="none" stroke="#ff6948" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>

    <g stroke="#0b1a14" stroke-width="3" opacity="0.7">
      <line x1="72" y1="135" x2="199" y2="135"/>
      <line x1="72" y1="150" x2="160" y2="150"/>
      <line x1="1000" y1="1310" x2="1128" y2="1310"/>
      <line x1="1040" y1="1325" x2="1128" y2="1325"/>
    </g>

    <rect width="${width}" height="${height}" filter="url(#grain)" opacity="0.7"/>
  </svg>
`;

await mkdir(outputDirectory, { recursive: true });
await sharp(Buffer.from(svg)).webp({ quality: 91 }).toFile(output);

console.log(`Generated ${output}`);
