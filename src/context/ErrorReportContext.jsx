import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import ErrorReportBubble from '../components/ErrorReportBubble';
import ErrorReportModal from '../components/ErrorReportModal';
import { metadataFromElement } from '../lib/errorReport';
import { findReportableElement } from '../lib/reportableAttrs';

const ErrorReportContext = createContext(null);

function computeBubblePosition(rect) {
  const padding = 8;
  const left = rect.left + rect.width / 2;
  const top = Math.max(padding, rect.top - padding);
  return { left, top };
}

export function ErrorReportProvider({ children, sessionUser, onRequestLogin }) {
  const [bubblePos, setBubblePos] = useState(null);
  const [pendingElement, setPendingElement] = useState(null);
  const [markedContent, setMarkedContent] = useState('');
  const [modalDraft, setModalDraft] = useState(null);
  const pendingRef = useRef(null);

  const clearBubble = useCallback(() => {
    setBubblePos(null);
    setPendingElement(null);
    setMarkedContent('');
    pendingRef.current = null;
  }, []);

  const openModalFromPending = useCallback(() => {
    const el = pendingRef.current;
    if (!el) return;
    const metadata = metadataFromElement(el);
    if (!metadata) {
      clearBubble();
      return;
    }

    const selection = window.getSelection();
    const selectedText = selection?.toString()?.trim() || markedContent;
    let content = selectedText;

    if (!content) {
      if (el.tagName === 'IMG') content = el.getAttribute('src') || el.alt || '';
      else if (el.tagName === 'IFRAME' || el.tagName === 'VIDEO') {
        content = el.getAttribute('src') || '';
      } else {
        content = el.textContent?.trim() || '';
      }
    }

    setModalDraft({ element: el, metadata, markedContent: content });
    clearBubble();
    selection?.removeAllRanges?.();
  }, [clearBubble, markedContent]);

  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      clearBubble();
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      clearBubble();
      return;
    }

    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (!range) {
      clearBubble();
      return;
    }

    let node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const reportable = findReportableElement(node);
    if (!reportable) {
      clearBubble();
      return;
    }

    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      clearBubble();
      return;
    }

    pendingRef.current = reportable;
    setPendingElement(reportable);
    setMarkedContent(text);
    setBubblePos(computeBubblePosition(rect));
  }, [clearBubble]);

  const handleMediaClick = useCallback(
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const reportable = target.closest('[data-source][data-type][data-key][data-field]');
      if (!reportable) return;

      const tag = reportable.tagName;
      const isMedia = tag === 'IMG' || tag === 'VIDEO' || tag === 'IFRAME';

      if (!isMedia) return;

      event.preventDefault();
      event.stopPropagation();

      pendingRef.current = reportable;
      setPendingElement(reportable);
      setMarkedContent(
        reportable.getAttribute('src') ||
          reportable.textContent?.trim() ||
          '',
      );
      setBubblePos(computeBubblePosition(reportable.getBoundingClientRect()));
    },
    [],
  );

  useEffect(() => {
    const onMouseUp = () => {
      window.requestAnimationFrame(handleSelection);
    };

    const onScroll = () => {
      if (bubblePos) clearBubble();
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        clearBubble();
        setModalDraft(null);
      }
    };

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('click', handleMediaClick, true);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('click', handleMediaClick, true);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [handleSelection, handleMediaClick, bubblePos, clearBubble]);

  const value = {
    openReportForElement: (element, content) => {
      const metadata = metadataFromElement(element);
      if (!metadata) return;
      setModalDraft({ element, metadata, markedContent: content || element.textContent?.trim() || '' });
    },
  };

  return (
    <ErrorReportContext.Provider value={value}>
      {children}
      <ErrorReportBubble position={bubblePos} onOpen={openModalFromPending} />
      <ErrorReportModal
        draft={modalDraft}
        sessionUser={sessionUser}
        onClose={() => setModalDraft(null)}
        onRequestLogin={onRequestLogin}
      />
    </ErrorReportContext.Provider>
  );
}

export function useErrorReport() {
  return useContext(ErrorReportContext);
}
