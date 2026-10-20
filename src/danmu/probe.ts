/**
 * 供区域存储测量的零高度标记点。
 *
 * 每个标记点注册进一个 additive 列表槽位，其唯一用途是被测量。
 * 样式使 Conversation 的布局决定矩形含义，头部标记点填满头部该行的高度，
 * 输入框标记点填满所在栏的宽度。
 */

import type { CSSProperties, ReactElement } from 'react';
import type { ConversationBoxStore, RegionPart } from './region';

/** 本模块使用的最小 React 接口。 */
type ReactRuntime = typeof import('react');

/** 使标记点报告边界且不影响布局的样式。 */
export const MARKER_STYLE: Record<RegionPart, CSSProperties> = {
  'content-top': { width: 0, height: '100%', pointerEvents: 'none' },
  'content-bottom': { width: '100%', height: 0, pointerEvents: 'none' },
};

/** 为内容区的某一条边界构建标记点组件。 */
export function createRegionProbe(
  React: ReactRuntime,
  store: ConversationBoxStore,
  part: RegionPart,
): () => ReactElement {
  return function RegionProbe(): ReactElement {
    const ref = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
      store.observe(part, ref.current);

      return () => store.observe(part, null);
    }, []);

    return React.createElement('div', {
      ref,
      'aria-hidden': true,
      'data-danmu-region': part,
      style: MARKER_STYLE[part],
    });
  };
}
