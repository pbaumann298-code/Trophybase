import { markHintSeen } from '../lib/featureHints';

function FeatureHint({ id, text, moreLabel, okLabel, onMore }) {
  const dismiss = () => markHintSeen(id);

  return (
    <div className="portrait-guide-hint" role="status">
      <p className="portrait-guide-hint__text">
        {text}{' '}
        <button type="button" className="portrait-guide-hint__link" onClick={() => { dismiss(); onMore(); }}>
          {moreLabel}
        </button>
      </p>
      <div className="portrait-guide-hint__actions">
        <button type="button" className="portrait-guide-hint__btn" onClick={dismiss}>
          {okLabel}
        </button>
      </div>
    </div>
  );
}

export default FeatureHint;
