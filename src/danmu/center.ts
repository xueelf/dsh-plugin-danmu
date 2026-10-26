/**
 * 居中弹幕的垂直轨道分配，顶部和底部共用。
 *
 * 这类弹幕水平居中，只占用垂直空间，按出现顺序向下排列，
 * 存活时长为 B 站网页端的默认 4.5 秒。底部先按同一套槽位分配，
 * 再由 `bottomOffset` 翻到容器底部。
 *
 * 首行从 `offsetTop = 4` 开始，重叠时用 `bottom + 1` 找下一行。
 * 来源：`.refs/npd.491.8e830665.js` 的 `eh.add`。
 */

import { DEFAULT_DURATION, LAYER_LIMIT, OFFSET_TOP } from './space-manager';

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

/**
 * 把顶部槽位翻到底部。
 *
 * 来源：npd.491 底部弹幕类的 `collisionCheck`：
 * `containerSize.height * (preventShade ? .85 : 1) - height - y`。
 * 播放器的 `preventShade` 为 false。
 */
export function bottomOffset(
  containerHeight: number,
  height: number,
  top: number,
): number {
  return containerHeight - height - top;
}

/** 居中弹幕的垂直轨道，顶部和底部共用。 */
export class CenterAllocator {
  private rows: Array<CenterRow[] | undefined> = [];

  /** 返回新弹幕在顶部坐标系里的 y 偏移，放不下时返回 `null`。 */
  add(request: CenterRequest): number | null {
    const vertical = request.containerHeight + 1;

    // 和 B 站一样，单条高度超过整层时直接丢弃。
    if (request.height >= vertical) {
      return null;
    }
    const limit = request.area > 0 ? (vertical * request.area) / 100 : 0;

    this.prune(request.now);

    // 与 B 站一致：一组放不下时，只有显示区域不设上限才尝试下一组。
    for (let index = 0; index < LAYER_LIMIT; index += 1) {
      const list = this.rows[index] ?? [];
      const y = this.scan(list, limit, vertical, request.height);

      if (y !== null) {
        this.insert(index, y, request.height, request.now);

        return y;
      }

      if (limit > 0) {
        return null;
      }
    }
    return null;
  }

  /** 丢掉已经离开的轨道，并保持按 bottom 有序。 */
  private prune(now: number): void {
    for (let index = 0; index < this.rows.length; index += 1) {
      const list = this.rows[index];

      if (list === undefined) {
        continue;
      }
      const alive = list.filter(row => row.endTime > now);

      alive.sort((left, right) => left.bottom - right.bottom);
      list.length = 0;
      list.push(...alive);
    }
  }

  /** 在一条轨道列表里找一个能装下的 y。 */
  private scan(
    list: readonly CenterRow[],
    limit: number,
    vertical: number,
    height: number,
  ): number | null {
    let y = OFFSET_TOP;
    let bottom = y + height;

    for (const row of list) {
      if (row.bottom <= y) {
        continue;
      }

      if (row.y > bottom) {
        break;
      }
      y = row.bottom + 1;
      bottom = y + height;
    }

    if (bottom > vertical || (limit > 0 && bottom > limit)) {
      return null;
    }
    return y;
  }

  /** 把一条弹幕放进对应的碰撞层。 */
  private insert(index: number, y: number, height: number, now: number): void {
    const list = this.rows[index] ?? [];

    this.rows[index] = list;
    list.push({ y, bottom: y + height, endTime: now + DEFAULT_DURATION });
  }
}
