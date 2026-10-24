/**
 * 标记点的 gap 补偿。
 *
 * 标记点作为额外 flex 子项会占一个 gap，按主轴方向用 -gap/2 抵消。
 * B 站播放器没有该标记点。纯函数留在本文件，DOM 读取在
 * `ui/RegionProbe.tsx`。
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
