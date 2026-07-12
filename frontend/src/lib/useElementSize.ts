import { useEffect, useRef, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/** Tracks the bounding rect of the returned ref. Useful for widget-level
 *  responsive decisions (drop content when the cell shrinks below a threshold).
 */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}
