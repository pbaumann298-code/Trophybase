import React from 'react';
import { reportableDataAttrs } from '../lib/reportableAttrs';

/**
 * Text-/Medien-Block mit data-*-Attributen für Fehlermeldungen.
 * @param {'span'|'p'|'h3'|'a'|'img'} as
 */
function Reportable({
  as: Tag = 'span',
  source,
  type,
  reportKey,
  field,
  className = '',
  children,
  ...rest
}) {
  const attrs = reportableDataAttrs({ source, type, reportKey, field });

  if (Tag === 'img') {
    return (
      <img
        {...attrs}
        {...rest}
        className={`${className} cursor-pointer`.trim()}
        alt={rest.alt ?? ''}
        title={rest.title ?? 'Fehler melden: Bild anklicken'}
      />
    );
  }

  return (
    <Tag {...attrs} {...rest} className={`select-text ${className}`.trim()}>
      {children}
    </Tag>
  );
}

export default Reportable;
