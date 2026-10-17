import { useLocale } from '../context/LocaleContext';

function SearchIncludeTrophiesOnly({ id, checked, onChange }) {
  const { t } = useLocale();
  return (
    <label htmlFor={id} className="search-skip-quickwins">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{t('searchIncludeTrophiesOnly')}</span>
    </label>
  );
}

export default SearchIncludeTrophiesOnly;
