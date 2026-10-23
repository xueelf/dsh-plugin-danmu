/**
 * 标记点的 gap 补偿计算。
 *
 * DOM 读取和标记点组件在 `ui/RegionProbe.tsx`。
 * 这里只保留纯函数，便于回归测试。
 */

import type { CSSProperties } from 'react';

/** 按 flex 方向抵消标记点多占的一个 gap。 */
export function gapCompensation(
  gap: number,
  flexDirection: string,
): CSSProperties | null {
  if (!Number.isFinite(gap) || gap <= 0) {
    return null;
  }
  const margin = -gap / 2;

  return flexDirection.startsWith('row')
    ? { marginInline: margin }
    : { marginBlock: margin };
}
