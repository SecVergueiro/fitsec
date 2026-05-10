// Gera PNGs do app icon a partir de public/icon.svg
// Uso: npm i -D sharp && node scripts/generate-icons.mjs
//
// Saída:
//   public/icon-192.png       (Android / manifest)
//   public/icon-512.png       (Android / manifest)
//   public/apple-touch-icon.png  (iOS 180×180)
//   public/icon-maskable.png  (192 com safe-area)
//   public/favicon-32.png     (favicon)
//   public/favicon-16.png     (favicon)

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("public");
const SRC = path.join(ROOT, "icon.svg");

if (!fs.existsSync(SRC)) {
  console.error("public/icon.svg não encontrado");
  process.exit(1);
}

const targets = [
  { size: 16, name: "favicon-16.png" },
  { size: 32, name: "favicon-32.png" },
  { size: 180, name: "apple-touch-icon.png" },
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
];

const svg = fs.readFileSync(SRC);

for (const { size, name } of targets) {
  const out = path.join(ROOT, name);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log(`✓ ${name} (${size}×${size})`);
}

console.log("\nFeito. Commit os PNGs gerados.");
