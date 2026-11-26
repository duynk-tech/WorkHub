'use client';

import { useCallback, useState } from 'react';
import type { SpaceObject } from '@/lib/space-3d-types';
import { historyInit, historyPush, historyRedo, historyUndo, type LayoutHistory } from '@/lib/space-3d-layout';

/** Trạng thái bố cục vật thể + hoàn tác/làm lại cho Trình thiết kế. */
export function useLayoutHistory(initial: SpaceObject[]) {
  const [h, setH] = useState<LayoutHistory>(() => historyInit(initial));

  const reset = useCallback((objects: SpaceObject[]) => setH(historyInit(objects)), []);
  const commit = useCallback((updater: (prev: SpaceObject[]) => SpaceObject[]) => {
    setH((cur) => historyPush(cur, updater(cur.present)));
  }, []);
  const undo = useCallback(() => setH((cur) => historyUndo(cur)), []);
  const redo = useCallback(() => setH((cur) => historyRedo(cur)), []);

  return {
    objects: h.present,
    commit,
    reset,
    undo,
    redo,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
  };
}
