import { useState, useCallback } from 'react';

export function useToggleSet<T>(initial?: T[]) {
  const [set, setSet] = useState<Set<T>>(() => new Set(initial));

  const toggle = useCallback((item: T) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }, []);

  const toggleAll = useCallback((allItems: T[]) => {
    setSet((prev) => {
      if (prev.size === allItems.length) return new Set<T>();
      return new Set(allItems);
    });
  }, []);

  const has = useCallback((item: T) => set.has(item), [set]);

  const clear = useCallback(() => setSet(new Set()), []);

  const reset = useCallback((items: T[] = []) => setSet(new Set(items)), []);

  return { set, toggle, toggleAll, has, clear, reset };
}
