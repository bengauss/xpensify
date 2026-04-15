import { dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";
import { mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverDir = resolve(__dirname, "../server");
const require = createRequire(pathToFileURL(resolve(serverDir, "package.json")).href);
const sharp = require("sharp") as typeof import("sharp");

const outDir = resolve(__dirname, "../client/public/icons");
mkdirSync(outDir, { recursive: true });

const sizes = [
  { name: "icon-192.png", size: 192, padding: 14 },
  { name: "icon-512.png", size: 512, padding: 38 },
  { name: "apple-touch-icon.png", size: 180, padding: 14 },
];

async function main() {
  for (const { name, size, padding } of sizes) {
    const logoSize = size - padding * 2;
    const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#0c0d12"/>
  <g transform="translate(${padding}, ${padding})">
    <svg width="${logoSize}" height="${logoSize}" viewBox="0 0 100 100" fill="none">
      <path d="M50 12 L85 30 L85 70 L50 88 L15 70 L15 30 Z" stroke="#6c9cff" stroke-width="3.5" fill="rgba(108,156,255,0.08)"/>
      <path d="M50 50 L85 30 M50 50 L50 88 M50 50 L15 30" stroke="#6c9cff" stroke-width="2" opacity="0.25"/>
      <path d="M36 48 L46 58 L65 36" stroke="#6c9cff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </g>
</svg>`;

    const outPath = resolve(outDir, name);
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    console.log(`wrote ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
