import {
  slugify,
  hardwareToUrlSegment,
  parsePrettyGamePath,
  buildPrettyGamePath,
} from '../src/lib/gameSlug.js';

const titles = [
  ['Shadow of The Tomb Raider', 'shadow-of-the-tomb-raider'],
  ['God of War', 'god-of-war'],
  ["Assassin's Creed", 'assassins-creed'],
  ['The Last of Us', 'the-last-of-us'],
];

for (const [title, expected] of titles) {
  const got = slugify(title);
  if (got !== expected) {
    throw new Error(`slugify(${title}) => ${got}, expected ${expected}`);
  }
}

if (hardwareToUrlSegment('PS4/PS5') !== 'ps5') throw new Error('PS4/PS5');
if (hardwareToUrlSegment('PS4') !== 'ps4') throw new Error('PS4');
if (hardwareToUrlSegment('PlayStation 5') !== 'ps5') throw new Error('PS5');
if (hardwareToUrlSegment('PS Vita') !== 'psvita') throw new Error('vita');
if (parsePrettyGamePath('/de/ps5/astro-bot')?.slug !== 'astro-bot') throw new Error('parse');
if (buildPrettyGamePath('de', 'ps5', 'god-of-war-2018') !== '/de/ps5/god-of-war-2018') {
  throw new Error('build');
}
if (parsePrettyGamePath('/guide/NPWR1_00')) throw new Error('legacy parsed as pretty');
if (parsePrettyGamePath('/profile')) throw new Error('profile');

console.log('gameSlug ok');
