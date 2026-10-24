import {
  type CSSProperties,
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { gapCompensation } from '../danmu/probe';
import type { ConversationBoxStore, RegionPart } from '../danmu/region';

/** 标记点自身的尺寸和指针行为。gap 补偿由挂载后实测决定。 */
const MARKER_STYLE: Record<RegionPart, CSSProperties> = {
  'content-top': { width: 0, height: '100%', pointerEvents: 'none' },
  'content-bottom': { width: '100%', height: 0, pointerEvents: 'none' },
};

/** 找到标记点所在 flex 容器的 gap 和方向。 */
function readFlexGap(
  element: HTMLElement,
): { gap: number; direction: string } | null {
  let node = element.parentElement;

  while (node !== null) {
    const style = getComputedStyle(node);

    if (style.display.includes('flex')) {
      const direction = style.flexDirection;
      const raw = direction.startsWith('row') ? style.columnGap : style.rowGap;
      const gap = Number.parseFloat(raw);

      return Number.isFinite(gap) && gap > 0 ? { gap, direction } : null;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * 为内容区边界构建标记点。
 *
 * 区域由两个标记点推断，属 DSH 适配层。宿主不提供内容区矩形，
 * 已知限制见 `region.ts`。
 */
export function createRegionProbe(
  store: ConversationBoxStore,
  part: RegionPart,
): () => ReactElement {
  return function RegionProbe(): ReactElement {
    const ref = useRef<HTMLDivElement | null>(null);
    const [margin, setMargin] = useState<CSSProperties>({});

    useLayoutEffect(() => {
      const node = ref.current;

      if (node === null) {
        return;
      }
      const layout = readFlexGap(node);

      setMargin(
        layout === null
          ? {}
          : (gapCompensation(layout.gap, layout.direction) ?? {}),
      );
    }, [part]);
    useEffect(() => {
      store.observe(part, ref.current);

      return () => store.observe(part, null);
    }, []);

    return (
      <div
        ref={ref}
        aria-hidden="true"
        data-danmu-region={part}
        style={{ ...MARKER_STYLE[part], ...margin }}
      />
    );
  };
}
