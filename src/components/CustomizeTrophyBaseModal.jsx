import { useEffect, useId, useRef } from 'react';
import {
  getHomeCategoriesByIds,
  getHomeCategoryTitle,
  HOME_CATEGORIES,
} from '../lib/homeCategories';
import {
  HOME_BLUEPRINTS,
  HOME_LAYOUT_MODE,
  useUserPreferences,
} from '../lib/userPreferences';
import { useLocale } from '../context/LocaleContext';
import '../styles/home.css';

const LAYOUT_OPTIONS = [
  { id: HOME_LAYOUT_MODE.RAILS, labelKey: 'customizeLayoutRails', emoji: '🎞️' },
  { id: HOME_LAYOUT_MODE.GRID, labelKey: 'customizeLayoutGrid', emoji: '🎯' },
  { id: HOME_LAYOUT_MODE.TABLE, labelKey: 'customizeLayoutTable', emoji: '📊' },
  { id: HOME_LAYOUT_MODE.MINIMAL, labelKey: 'customizeLayoutMinimal', emoji: '🧘' },
];

function CustomizeTrophyBaseModal({ open, onClose }) {
  const { globalLocale, t } = useLocale();
  const {
    homeLayoutMode,
    orderedHomeCategories,
    setHomeLayoutMode,
    toggleHomeCategory,
    moveHomeCategory,
    applyHomeBlueprint,
    resetToDefaultBlueprint,
  } = useUserPreferences();
  const titleId = useId();
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const active = getHomeCategoriesByIds(orderedHomeCategories);
  const activeIds = new Set(orderedHomeCategories);
  const available = HOME_CATEGORIES.filter((cat) => !activeIds.has(cat.id));

  return (
    <div
      className="tb-architect-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="tb-architect">
        <header className="tb-architect-header">
          <div>
            <p className="tb-architect-kicker">{t('customizeTrophyBase')}</p>
            <h2 id={titleId} className="tb-architect-title">
              {t('customizeTrophyBaseTitle')}
            </h2>
            <p className="tb-architect-lead">{t('customizeTrophyBaseLead')}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="tb-architect-close"
            onClick={onClose}
            aria-label={t('customizeClose')}
          >
            ×
          </button>
        </header>

        <div className="tb-architect-body">
          <section className="tb-architect-section" aria-labelledby="tb-blueprints-heading">
            <h3 id="tb-blueprints-heading" className="tb-architect-section-title">
              {t('customizeBlueprints')}
            </h3>
            <div className="tb-architect-blueprints">
              {HOME_BLUEPRINTS.map((blueprint) => (
                <button
                  key={blueprint.id}
                  type="button"
                  className="tb-architect-blueprint"
                  onClick={() => applyHomeBlueprint(blueprint.id)}
                >
                  <span className="tb-architect-blueprint-emoji" aria-hidden>
                    {blueprint.emoji}
                  </span>
                  <span className="tb-architect-blueprint-copy">
                    <strong>{t(blueprint.titleKey)}</strong>
                    <span>{t(blueprint.bodyKey)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="tb-architect-section" aria-labelledby="tb-layout-heading">
            <h3 id="tb-layout-heading" className="tb-architect-section-title">
              {t('customizeLayoutMode')}
            </h3>
            <div className="tb-architect-layouts">
              {LAYOUT_OPTIONS.map((option) => {
                const selected = homeLayoutMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`tb-architect-layout${selected ? ' is-active' : ''}`}
                    aria-pressed={selected}
                    onClick={() => setHomeLayoutMode(option.id)}
                  >
                    <span aria-hidden>{option.emoji}</span>
                    {t(option.labelKey)}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="tb-architect-section" aria-labelledby="tb-cats-heading">
            <h3 id="tb-cats-heading" className="tb-architect-section-title">
              {t('customizeCategories')}
            </h3>
            <p className="tb-architect-hint">{t('customizeCategoriesHint')}</p>

            {active.length > 0 ? (
              <ul className="tb-architect-active">
                {active.map((cat, index) => {
                  const title = getHomeCategoryTitle(cat, globalLocale, t);
                  return (
                    <li key={cat.id} className="tb-architect-row">
                      <span className="tb-architect-row-label">
                        <span aria-hidden>{cat.emoji}</span>
                        {title}
                      </span>
                      <span className="tb-architect-row-actions">
                        <button
                          type="button"
                          className="tb-architect-icon-btn"
                          disabled={index === 0}
                          aria-label={t('customizeMoveUp').replaceAll('{title}', title)}
                          onClick={() => moveHomeCategory(cat.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="tb-architect-icon-btn"
                          disabled={index === active.length - 1}
                          aria-label={t('customizeMoveDown').replaceAll('{title}', title)}
                          onClick={() => moveHomeCategory(cat.id, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="tb-architect-remove"
                          onClick={() => toggleHomeCategory(cat.id)}
                        >
                          {t('customizeRemove')}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="tb-architect-empty">{t('customizeNoActive')}</p>
            )}

            {available.length > 0 ? (
              <div className="tb-architect-available">
                {available.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className="tb-architect-chip"
                    onClick={() => toggleHomeCategory(cat.id)}
                  >
                    <span aria-hidden>{cat.emoji}</span>
                    {getHomeCategoryTitle(cat, globalLocale, t)}
                    <span aria-hidden>+</span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <footer className="tb-architect-footer">
          <button
            type="button"
            className="tb-architect-reset"
            onClick={() => resetToDefaultBlueprint()}
          >
            {t('customizeReset')}
          </button>
          <button type="button" className="tb-architect-done" onClick={onClose}>
            {t('customizeClose')}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default CustomizeTrophyBaseModal;
