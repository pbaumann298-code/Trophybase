import { useEffect, useRef } from 'react';
import { useLocale } from '../context/LocaleContext';
import { guideTabId, guideTabPanelId } from '../lib/guideTabs';

const TAB_BTN =
  'px-4 sm:px-5 py-3 text-xs uppercase tracking-wider font-bold transition-all border-b-2 cursor-pointer whitespace-nowrap';

const ARROW_BTN =
  'hidden sm:flex items-center justify-center w-8 self-stretch text-lg text-zinc-500 hover:text-[#00ff66] bg-transparent border-none cursor-pointer transition-colors';

/**
 * Reiter-Leiste der Guide-Ansicht inklusive Pfeil-Buttons.
 * Die Pfeile stehen bewusst außerhalb des role="tablist", da dort nur Tabs erlaubt sind.
 */
export default function GuideTabBar({
  tabs,
  activeTab,
  onTabChange,
  onPrev,
  onNext,
  canGoPrev,
  canGoNext,
  anchorRef,
}) {
  const { t } = useLocale();
  const tabRefs = useRef(new Map());

  // Pfeiltasten verschieben die Auswahl – der Fokus muss mitwandern, sonst
  // verliert die Tastaturbedienung ihren Bezugspunkt.
  useEffect(() => {
    const active = document.activeElement;
    if (!active) return;
    const isTabButton = Array.from(tabRefs.current.values()).includes(active);
    if (!isTabButton) return;
    tabRefs.current.get(activeTab)?.focus();
  }, [activeTab]);

  const arrowClass = (usable) =>
    `${ARROW_BTN} ${usable ? '' : 'opacity-30 pointer-events-none'}`;

  const tabClass = (tab) =>
    `${TAB_BTN} ${
      activeTab === tab
        ? 'border-[#00ff66] text-white bg-zinc-800/30'
        : 'border-transparent text-zinc-500 hover:text-zinc-300'
    }`;

  return (
    <div
      ref={anchorRef}
      className="flex items-stretch border-b border-zinc-800 mb-6 min-w-0"
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={!canGoPrev}
        aria-label={t('prevTab')}
        className={arrowClass(canGoPrev)}
      >
        ‹
      </button>

      <div
        role="tablist"
        aria-label={t('guideTabs')}
        aria-orientation="horizontal"
        className="flex flex-wrap gap-2 flex-1 min-w-0"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={guideTabId(tab.id)}
            aria-selected={activeTab === tab.id}
            aria-controls={guideTabPanelId(tab.id)}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            className={tabClass(tab.id)}
            ref={(node) => {
              if (node) tabRefs.current.set(tab.id, node);
              else tabRefs.current.delete(tab.id);
            }}
          >
            {tab.icon} {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        aria-label={t('nextTab')}
        className={arrowClass(canGoNext)}
      >
        ›
      </button>
    </div>
  );
}
