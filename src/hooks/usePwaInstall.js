import { useEffect, useState } from 'react';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  const display = window.matchMedia?.('(display-mode: standalone)')?.matches;
  return Boolean(display || window.navigator.standalone);
}

function isIosLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function isMacSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const safari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|OPR|OPiOS|Android/i.test(ua);
  return safari && /Macintosh/.test(ua) && !isIosLike();
}

function isDesktopFirefox() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Firefox\//.test(ua) && !/Mobile|Android|Tablet/i.test(ua);
}

/**
 * Installationsangebot der öffentlichen App.
 * Versteckt im Standalone-Modus und auf Desktop-Firefox.
 * Chrome/Edge/Brave/Android liefern beforeinstallprompt, iOS und macOS Safari eine Kurzanleitung.
 */
export function usePwaInstall() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault();
      setDeferred(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const safari = isIosLike() || isMacSafari();
  const hidden = installed || isDesktopFirefox() || (!deferred && !safari);

  const promptInstall = async () => {
    if (!deferred?.prompt) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* Prompt geschlossen */
    }
    setDeferred(null);
  };

  return {
    hidden,
    mode: deferred ? 'native' : 'safari',
    platform: isIosLike() ? 'ios' : 'mac',
    promptInstall,
  };
}
