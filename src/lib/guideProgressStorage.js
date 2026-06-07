const COMPLETED_ITEMS_KEY = 'tb_completed_guide_items';

export function loadCompletedGuideItems() {
  try {
    const raw = localStorage.getItem(COMPLETED_ITEMS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCompletedGuideItems(items) {
  localStorage.setItem(COMPLETED_ITEMS_KEY, JSON.stringify(items));
}
