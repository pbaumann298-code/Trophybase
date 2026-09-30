/**
 * Stellt die Pokal-PNGs frei: einheitlicher Creme-Hintergrund raus, Kanten
 * weich, anschliessend auf ein gemeinsames quadratisches Format zentriert.
 *
 * Einmal-Werkzeug. Quelle bleibt unangetastet, Ziel ist src/assets/trophies/.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC_DIR = 'C:/Temp/TrophyBase/00_Website/Pokale/';
const OUT_DIR = path.join(__dirname, 'src', 'assets', 'trophies');

/** Innerhalb dieser Distanz zum Hintergrund gilt ein Pixel als Hintergrund. */
const TOL_HARD = 26;
/** Bis hierher wird weich ausgeblendet (Anti-Aliasing-Kante). */
const TOL_SOFT = 46;

const FILES = [
  ['Bronze.png', 'bronze.png'],
  ['Silber.png', 'silver.png'],
  ['Gold.png', 'gold.png'],
  ['Platin.png', 'platinum.png'],
];

function dist(r, g, b, ref) {
  return Math.sqrt((r - ref[0]) ** 2 + (g - ref[1]) ** 2 + (b - ref[2]) ** 2);
}

/** Median der Randpixel – robuster als eine einzelne Ecke. */
function backgroundRef(png) {
  const { width: w, height: h, data } = png;
  const rs = [];
  const gs = [];
  const bs = [];
  for (let x = 0; x < w; x += 1) {
    for (const y of [0, 1, h - 2, h - 1]) {
      const i = (y * w + x) * 4;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (const x of [0, 1, w - 2, w - 1]) {
      const i = (y * w + x) * 4;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
    }
  }
  const med = (arr) => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  return [med(rs), med(gs), med(bs)];
}

/** Gibt es im Aussenring Pixel, die deutlich abweichen? Das waere ein Rahmen. */
function reportFrame(png, ref) {
  const { width: w, height: h, data } = png;
  let off = 0;
  let maxD = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (x > 2 && x < w - 3 && y > 2 && y < h - 3) continue;
      const i = (y * w + x) * 4;
      const d = dist(data[i], data[i + 1], data[i + 2], ref);
      maxD = Math.max(maxD, d);
      if (d > 20) off += 1;
    }
  }
  return { off, maxD: Math.round(maxD) };
}

function cutout(png, ref) {
  const { width: w, height: h, data } = png;
  const isBg = new Uint8Array(w * h);
  const queue = [];

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (isBg[p]) return;
    const i = p * 4;
    if (dist(data[i], data[i + 1], data[i + 2], ref) > TOL_HARD) return;
    isBg[p] = 1;
    queue.push(p);
  };

  // Flutfuellung ausschliesslich vom Rand: so bleiben helle Stellen INNERHALB
  // des Pokals (Glanzlichter, der TB.app-Schriftzug) erhalten.
  for (let x = 0; x < w; x += 1) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    push(0, y);
    push(w - 1, y);
  }

  while (queue.length > 0) {
    const p = queue.pop();
    const x = p % w;
    const y = (p - x) / w;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  for (let p = 0; p < w * h; p += 1) {
    const i = p * 4;
    if (isBg[p]) {
      data[i + 3] = 0;
      continue;
    }

    // Weiche Kante: Pixel direkt am Hintergrund teilweise durchscheinend
    // machen und den Creme-Anteil herausrechnen, sonst bleibt ein heller Saum.
    const x = p % w;
    const y = (p - x) / w;
    const touchesBg =
      (x > 0 && isBg[p - 1]) ||
      (x < w - 1 && isBg[p + 1]) ||
      (y > 0 && isBg[p - w]) ||
      (y < h - 1 && isBg[p + w]);
    if (!touchesBg) continue;

    const d = dist(data[i], data[i + 1], data[i + 2], ref);
    if (d >= TOL_SOFT) continue;

    const a = Math.max(0, Math.min(1, (d - TOL_HARD) / (TOL_SOFT - TOL_HARD)));
    if (a <= 0) {
      data[i + 3] = 0;
      continue;
    }
    for (let c = 0; c < 3; c += 1) {
      const un = (data[i + c] - ref[c] * (1 - a)) / a;
      data[i + c] = Math.max(0, Math.min(255, Math.round(un)));
    }
    data[i + 3] = Math.round(a * 255);
  }

  return png;
}

/** Transparente Raender abschneiden und zentriert auf ein Quadrat legen. */
function trimToSquare(png, pad = 2) {
  const { width: w, height: h, data } = png;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const size = Math.max(cw, ch) + pad * 2;
  const out = new PNG({ width: size, height: size });
  out.data.fill(0);

  const offX = Math.floor((size - cw) / 2);
  const offY = Math.floor((size - ch) / 2);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const src = ((y + minY) * w + (x + minX)) * 4;
      const dst = ((y + offY) * size + (x + offX)) * 4;
      for (let c = 0; c < 4; c += 1) out.data[dst + c] = data[src + c];
    }
  }
  return { png: out, size, cw, ch };
}

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [srcName, outName] of FILES) {
  const png = PNG.sync.read(fs.readFileSync(SRC_DIR + srcName));
  const ref = backgroundRef(png);
  const frame = reportFrame(png, ref);

  cutout(png, ref);
  const { png: out, size, cw, ch } = trimToSquare(png);

  let opaque = 0;
  let partial = 0;
  for (let i = 3; i < out.data.length; i += 4) {
    if (out.data[i] === 255) opaque += 1;
    else if (out.data[i] > 0) partial += 1;
  }

  const target = path.join(OUT_DIR, outName);
  fs.writeFileSync(target, PNG.sync.write(out));

  console.log(
    `${srcName.padEnd(12)} bg=${ref.join(',')} randabweichung=${frame.off}px(max ${frame.maxD}) ` +
      `-> ${outName.padEnd(13)} inhalt ${cw}x${ch} auf ${size}x${size}, ` +
      `deckend=${opaque} weich=${partial}`,
  );
}
