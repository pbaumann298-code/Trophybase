import { useLocale } from '../context/LocaleContext';

function SearchSkipQuickwins({ id, checked, onChange }) {
  const { t } = useLocale();
  return (
    <label htmlFor={id} className="search-skip-quickwins">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{t('searchSkipQuickwins')}</span>
    </label>
  );
}

export default SearchSkipQuickwins;
