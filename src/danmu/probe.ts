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

/**
 * 标记点自身不占宽高，但作为宿主 flex 列表项会额外占一个 gap。
 * 宿主 header utilities 的 gap 是 8px，composerStack 的 gap 是 6px，
 * 用等量负外边距抵消，恢复宿主原本的间距。
 * content-top 前后都有邻居，水平两侧各抵消一半。
 * content-bottom 只有后一个邻居，纵向全部由 marginBottom 抵消。
 */
export const MARKER_STYLE: Record<RegionPart, CSSProperties> = {
  'content-top': {
    width: 0,
    height: '100%',
    pointerEvents: 'none',
    marginInline: -4,
  },
  'content-bottom': {
    width: '100%',
    height: 0,
    pointerEvents: 'none',
    marginBottom: -6,
  },
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
