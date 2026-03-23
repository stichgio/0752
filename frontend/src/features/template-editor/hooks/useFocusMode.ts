import { useState, useEffect, useCallback } from 'react';

const FOCUS_MODE_KEY = 'template-editor:focus-mode';

export function useFocusMode() {
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(FOCUS_MODE_KEY);
        if (saved === 'true') {
          setIsFocusMode(true);
        }
      } catch {
        // Ignore localStorage errors
      }
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(FOCUS_MODE_KEY, isFocusMode.toString());
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [isFocusMode]);

  const toggleFocusMode = useCallback(() => {
    setIsFocusMode(prev => !prev);
  }, []);

  // Global keydown handler for Ctrl+.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/contenteditable
      const isTypingTarget = 
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);

      if (isTypingTarget) return;

      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        toggleFocusMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleFocusMode]);

  return { isFocusMode, toggleFocusMode };
}
