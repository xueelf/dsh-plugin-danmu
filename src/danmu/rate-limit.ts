/**
 * B 站滚动弹幕的插入上限。
 *
 * 来源：npd.491 的 `getRollDanmakuMaxCountPerSecond` 与 `insert` 内的
 * `++i > o`。B 站按插入批次计数，播放器约每秒一批；事件流没有批次，
 * 这里用任意 1 秒滑动窗口实现同一个每秒上限。
 */

/** B 站滚动弹幕每秒上限。`area` 为 0 时返回 9999，等于不限制。 */
export function rollDanmuLimit(
  area: number,
  height: number,
  fontSize: number,
): number {
  return area > 0
    ? Math.ceil(((area / 100) * height) / (28.125 * fontSize))
    : 9999;
}

/** 任意 1 秒窗口内最多放行 `limit` 条滚动弹幕。 */
export class RollDanmuRateLimiter {
  private readonly times: number[] = [];

  /** 记录一次放行，返回是否还有额度。`now` 为毫秒。 */
  admit(now: number, limit: number): boolean {
    let first = this.times[0];

    while (first !== undefined && first <= now - 1000) {
      this.times.shift();
      first = this.times[0];
    }

    if (this.times.length >= limit) {
      return false;
    }
    this.times.push(now);

    return true;
  }

  /** 清空窗口，切会话时调用。 */
  reset(): void {
    this.times.length = 0;
  }
}
