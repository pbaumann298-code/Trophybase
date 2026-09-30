/** Kontrolle: die freigestellten Pokale auf Seitenhintergrund #121314 legen. */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const DIR = path.join(__dirname, 'src', 'assets', 'trophies');
const FILES = ['bronze.png', 'silver.png', 'gold.png', 'platinum.png'];
const BG = [18, 19, 20];
const GAP = 8;

const sheets = FILES.map((f) => PNG.sync.read(fs.readFileSync(path.join(DIR, f))));
const size = Math.max(...sheets.map((p) => p.height));
const width = sheets.reduce((sum, p) => sum + p.width, 0) + GAP * (sheets.length + 1);
const height = size + GAP * 2;

const out = new PNG({ width, height });
for (let i = 0; i < out.data.length; i += 4) {
  out.data[i] = BG[0];
  out.data[i + 1] = BG[1];
  out.data[i + 2] = BG[2];
  out.data[i + 3] = 255;
}

let cursor = GAP;
for (const png of sheets) {
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const s = (y * png.width + x) * 4;
      const a = png.data[s + 3] / 255;
      if (a === 0) continue;
      const d = ((y + GAP) * width + (x + cursor)) * 4;
      for (let c = 0; c < 3; c += 1) {
        out.data[d + c] = Math.round(png.data[s + c] * a + out.data[d + c] * (1 - a));
      }
    }
  }
  cursor += png.width + GAP;
}

const target = path.join(__dirname, 'tb-pokale-preview.png');
fs.writeFileSync(target, PNG.sync.write(out));
console.log(`${target}  ${width}x${height}`);
