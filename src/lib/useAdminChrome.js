import { useEffect, useState } from 'react';
import { isAdminUser } from './adminAccess';
import { adminOverlaysHidden, subscribeAdminOverlays } from './adminOverlayPreference';

export function useHideAdminOverlays() {
  const [hidden, setHidden] = useState(adminOverlaysHidden);
  useEffect(() => subscribeAdminOverlays(setHidden), []);
  return hidden;
}

/** Admin-Sitzung, deren Buttons auf der öffentlichen Seite sichtbar sein sollen. */
export function useShowAdminChrome(user, options) {
  const hidden = useHideAdminOverlays();
  return isAdminUser(user, options) && !hidden;
}
