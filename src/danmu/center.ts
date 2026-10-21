/**
 * 顶部弹幕的居中轨道分配。
 *
 * 这类弹幕水平居中，只占用垂直空间，按出现顺序向下排列，
 * 存活时长为 B 站网页端的默认 4.5 秒。
 *
 * 首行从 `offsetTop = 4` 开始，重叠时用 `bottom + 1` 找下一行。
 * 来源：`.refs/npd.491.8e830665.js` 的 `eh.add`。
 */

import { DEFAULT_DURATION, OFFSET_TOP } from './space-manager';

export interface CenterRequest {
  readonly height: number;
  /** 发起请求时的时钟读数，秒。 */
  readonly now: number;
  readonly containerHeight: number;
  /** 显示区域，0 到 100。为 0 表示不设上限。 */
  readonly area: number;
}

interface CenterRow {
  readonly y: number;
  readonly bottom: number;
  readonly endTime: number;
}

/** 顶部弹幕的垂直轨道。 */
export class CenterAllocator {
  private rows: CenterRow[] = [];

  /** 返回新弹幕的 top 偏移，放不下时返回 `null`。 */
  add(request: CenterRequest): number | null {
    const vertical = request.containerHeight + 1;

    // 和 B 站一样，单条高度超过整层时直接丢弃。
    if (request.height >= vertical) {
      return null;
    }
    const limit = request.area > 0 ? (vertical * request.area) / 100 : 0;

    this.rows = this.rows
      .filter(row => row.endTime > request.now)
      .sort((left, right) => left.bottom - right.bottom);

    let y = OFFSET_TOP;
    let bottom = y + request.height;

    for (const row of this.rows) {
      if (row.bottom <= y) {
        continue;
      }

      if (row.y > bottom) {
        break;
      }
      y = row.bottom + 1;
      bottom = y + request.height;
    }

    if (bottom > vertical || (limit > 0 && bottom > limit)) {
      return null;
    }
    this.rows.push({
      y,
      bottom,
      endTime: request.now + DEFAULT_DURATION,
    });

    return y;
  }
}
