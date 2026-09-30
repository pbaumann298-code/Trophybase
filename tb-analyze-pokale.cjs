const fs = require('fs');
const { PNG } = require('pngjs');

const dir = 'C:/Temp/TrophyBase/00_Website/Pokale/';

for (const name of ['Bronze.png', 'Silber.png', 'Gold.png', 'Platin.png']) {
  const png = PNG.sync.read(fs.readFileSync(dir + name));
  const { width: w, height: h, data } = png;
  const at = (x, y) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]].join(',');
  };

  console.log(`=== ${name}  ${w}x${h}`);
  console.log(`  Ecken: TL=${at(0, 0)} TR=${at(w - 1, 0)} BL=${at(0, h - 1)} BR=${at(w - 1, h - 1)}`);
  console.log(`  oben-mitte=${at(Math.floor(w / 2), 1)}  links-mitte=${at(1, Math.floor(h / 2))}`);
  console.log(`  Zeile y=4: ${[0, 5, 10, 20, 40, 60].map((x) => at(x, 4)).join(' | ')}`);

  const hist = new Map();
  let transparent = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) {
      transparent += 1;
      continue;
    }
    const k = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    hist.set(k, (hist.get(k) || 0) + 1);
  }

  console.log(`  voll transparent: ${transparent} von ${w * h}`);
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [c, n] of top) console.log(`    ${c.padEnd(16)} ${n}`);
}
