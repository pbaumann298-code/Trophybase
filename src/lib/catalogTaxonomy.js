/**
 * Spielertypen auf der Easy-Platins-Seite.
 * `id` ist der Filter-Schlüssel, `tags` die home_tags, Cover und Akzentfarbe
 * gehören zur Kachel.
 */
export const PLAYER_ARCHETYPES = [
  {
    id: 'hidden_object',
    labelKey: 'easyPlatinsArchetypeHiddenObject',
    icon: '🔍',
    coverUrl: '/images/archetypes/hidden_object.jpeg',
    accentColor: '#34d399',
    tags: ['hidden_object', 'point_and_click'],
    publishers: ['Artifex Mundi', '8Floor', 'Boomzap', 'Grey Alien'],
  },
  {
    id: 'mystery_crime',
    labelKey: 'easyPlatinsArchetypeMystery',
    icon: '🕵️',
    coverUrl: '/images/archetypes/mystery_crime.jpeg',
    accentColor: '#818cf8',
    tags: ['mystery_crime'],
    titleIncludes: ['Agatha Christie', 'Poirot', 'Sherlock', 'Murdered', 'CSI', 'Noire', 'Blacksad'],
  },
  {
    id: 'fmv',
    labelKey: 'easyPlatinsArchetypeFmv',
    icon: '🎬',
    coverUrl: '/images/archetypes/fmv.jpeg',
    accentColor: '#fb7185',
    tags: ['fmv'],
    publishers: ['Wales Interactive', 'Telltale', 'Dontnod', 'Supermassive'],
  },
  {
    id: 'visual_novel',
    labelKey: 'easyPlatinsArchetypeVisualNovel',
    icon: '📖',
    coverUrl: '/images/archetypes/visual_novel.jpeg',
    accentColor: '#c084fc',
    tags: ['visual_novel', 'otome_romance'],
    titleIncludes: ['Steins', 'Somnium', 'Collar', 'Danganronpa', 'Chaos;Child', 'Root Letter'],
  },
  {
    id: 'family_cozy',
    labelKey: 'easyPlatinsArchetypeFamily',
    icon: '🧸',
    coverUrl: '/images/archetypes/family_cozy.jpeg',
    accentColor: '#fbbf24',
    tags: ['family', 'platformer', 'indie'],
  },
  {
    id: 'arcade_retro',
    labelKey: 'easyPlatinsArchetypeArcade',
    icon: '🕹️',
    coverUrl: '/images/archetypes/arcade_retro.jpeg',
    accentColor: '#22d3ee',
    tags: ['arcade_nostalgia'],
    publishers: ['Hamster Corporation'],
    titleStartsWith: ['ACA NEOGEO', 'Arcade Archives'],
  },
];
