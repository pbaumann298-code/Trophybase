/** @typedef {{ gruppe: string, title: string, trophies: object[] }} DlcTrophyGroup */

/**
 * @param {object} trophy
 */
export function getTrophyGruppe(trophy) {
  return String(trophy?.trophy_gruppe ?? trophy?.Trophy_Gruppe ?? 'default')
    .trim()
    .toLowerCase();
}

/**
 * @param {object} trophy
 */
export function getDlcSpielname(trophy) {
  return String(
    trophy?.spielname ?? trophy?.Spielname ?? trophy?.spiel_name ?? '',
  ).trim();
}

/**
 * Client-side grouping: Hauptspiel (default) + DLC-Packs nach trophy_gruppe.
 * @param {object[]} trophies
 * @returns {{ mainGame: object[], dlcGroups: DlcTrophyGroup[] }}
 */
export function groupTrophiesByPack(trophies) {
  const mainGame = [];
  /** @type {Map<string, DlcTrophyGroup>} */
  const dlcMap = new Map();

  for (const trophy of trophies || []) {
    const gruppe = getTrophyGruppe(trophy);

    if (gruppe === 'default') {
      mainGame.push(trophy);
      continue;
    }

    if (!dlcMap.has(gruppe)) {
      dlcMap.set(gruppe, {
        gruppe,
        title: getDlcSpielname(trophy) || `DLC ${gruppe}`,
        trophies: [],
      });
    }

    const bucket = dlcMap.get(gruppe);
    bucket.trophies.push(trophy);

    const name = getDlcSpielname(trophy);
    if (name) bucket.title = name;
  }

  const idOf = (trophy) => String(trophy?.platform_achievement_id ?? trophy?.trophy_id ?? '');
  const lowestId = (trophies) =>
    trophies.reduce((min, trophy) => {
      const id = idOf(trophy);
      if (min == null || id.localeCompare(min, undefined, { numeric: true }) < 0) return id;
      return min;
    }, null);
  const dlcGroups = [...dlcMap.values()].sort((a, b) =>
    String(lowestId(a.trophies) ?? '').localeCompare(String(lowestId(b.trophies) ?? ''), undefined, {
      numeric: true,
    }),
  );

  return { mainGame, dlcGroups };
}

/**
 * @param {object[]} trophies
 * @param {Record<string, boolean>} unlockedTrophies
 * @param {(t: object) => string} getTrophyKey
 * @param {Set<string>} [earnedIds]
 */
export function countUnlockedInList(trophies, unlockedTrophies, getTrophyKey, earnedIds) {
  let unlocked = 0;
  for (const t of trophies) {
    const key = getTrophyKey(t);
    if (earnedIds?.has?.(key) || unlockedTrophies[key]) unlocked += 1;
  }
  return unlocked;
}
