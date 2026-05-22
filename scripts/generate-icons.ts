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
    <svg width="${logoSize}" height="${logoSize}" viewBox="0 0 1024 1024" fill="none">
      <g transform="translate(512 512)">
        <rect x="72" y="-78" width="400" height="156" rx="78" transform="rotate(45)" fill="#6c9cff"></rect>
        <rect x="72" y="-78" width="400" height="156" rx="78" transform="rotate(135)" fill="#69db7c"></rect>
        <rect x="72" y="-78" width="400" height="156" rx="78" transform="rotate(225)" fill="#ff6b6b"></rect>
        <rect x="72" y="-78" width="400" height="156" rx="78" transform="rotate(315)" fill="#9775fa"></rect>
      </g>
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
