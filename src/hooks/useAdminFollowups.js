import { useEffect, useState } from 'react';
import { loadAdminFollowups, subscribeAdminFollowups } from '../lib/adminFollowups';

export function useAdminFollowups(userId) {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) {
      setEntries([]);
      setError('');
      return undefined;
    }

    let cancelled = false;
    let request = 0;

    const refresh = () => {
      const current = ++request;
      loadAdminFollowups()
        .then((rows) => {
          if (cancelled || current !== request) return;
          setEntries(rows);
          setError('');
        })
        .catch((err) => {
          if (cancelled || current !== request) return;
          setEntries([]);
          setError(err.message || 'Wiedervorlage konnte nicht geladen werden.');
        });
    };

    refresh();

    const unsubscribe = subscribeAdminFollowups((rows) => {
      request += 1;
      if (cancelled) return;
      setEntries(rows);
      setError('');
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId]);

  return { entries, error };
}
