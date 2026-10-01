import { isGuidePublished, PUBLISH_LOCALE } from '../lib/guidePublication';

function GuideOnlineBadge({ game, visible = false, size = 'sm', className = '' }) {
  if (!visible || !isGuidePublished(game, PUBLISH_LOCALE)) return null;

  const sizeClass =
    size === 'md' ? 'w-8 h-8' : size === 'lg' ? 'w-10 h-10' : 'w-7 h-7';
  const iconClass = size === 'md' || size === 'lg' ? 'w-3.5 h-3.5' : 'w-3 h-3';

  return (
    <span
      className={`${sizeClass} rounded-full border border-[#00ff66] bg-[#00ff66] text-[#121314] flex items-center justify-center shadow-md ${className}`}
      title="Guide ist online"
      aria-label="Guide ist online"
    >
      <svg
        viewBox="0 0 24 24"
        className={iconClass}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12.5 10 17.5 19 7" />
      </svg>
    </span>
  );
}

export default GuideOnlineBadge;
