import { useEffect, useState } from 'react';
import { loadAdminFollowups, subscribeAdminFollowups } from '../lib/adminFollowups';

export function useAdminFollowups(userId) {
  const [entries, setEntries] = useState(() => loadAdminFollowups(userId));

  useEffect(() => {
    if (!userId) {
      setEntries([]);
      return undefined;
    }
    setEntries(loadAdminFollowups(userId));
    return subscribeAdminFollowups(userId, setEntries);
  }, [userId]);

  return entries;
}
