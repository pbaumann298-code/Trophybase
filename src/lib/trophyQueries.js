/** Beschreibung aus merged achievement row. */
export function getTrophyDescription(trophy) {
  if (!trophy) return '';
  return String(
    trophy.trophy_desc ??
      trophy.trophy_description ??
      trophy.Trophy_Desc ??
      '',
  ).trim();
}

/** KI-Übersetzung der Beschreibung, sofern sie vom Sony-Text abweicht. */
export function getTrophyAiTranslation(trophy) {
  if (!trophy) return '';
  return String(trophy.trophy_desc_translation ?? '').trim();
}

/** platform_achievement_id als String für Abgleich mit der earned-Tabelle. */
export function getTrophyIdKey(trophy) {
  if (!trophy) return '';
  return String(
    trophy.platform_achievement_id ?? trophy.trophy_id ?? trophy.id ?? '',
  );
}
