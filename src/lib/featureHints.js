const PREFIX = 'tb_hint_';

export function hintSeen(id) {
  try {
    return window.localStorage.getItem(PREFIX + id) === '1';
  } catch {
    return false;
  }
}

export function markHintSeen(id) {
  try {
    window.localStorage.setItem(PREFIX + id, '1');
  } catch {
    /* privater Modus */
  }
  window.dispatchEvent(new CustomEvent('tb-hint-seen', { detail: id }));
}
