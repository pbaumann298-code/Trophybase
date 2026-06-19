/**
 * data-*-Attribute für kontextuelle Fehlermeldungen (Textmarkierung).
 * @param {{ source: string, type: string, reportKey: string, field: string }} params
 */
export function reportableDataAttrs({ source, type, reportKey, field }) {
  return {
    'data-source': source,
    'data-type': type,
    'data-key': reportKey,
    'data-field': field,
    'data-reportable': 'true',
  };
}

/** Nächstes Elternelement mit vollständigen Report-Attributen. */
export function findReportableElement(startNode) {
  if (!startNode) return null;
  let el = startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode;
  while (el && el !== document.body) {
    if (
      el.dataset?.source &&
      el.dataset?.type &&
      el.dataset?.key &&
      el.dataset?.field
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/** Liest die vier Pflicht-Attribute aus einem DOM-Element. */
export function readReportableDataset(element) {
  if (!element?.dataset) return null;
  const { source, type, key, field } = element.dataset;
  if (!source || !type || !key || !field) return null;
  return { source, type, key, field };
}
