/**
 * 复刻 B 站网页端的轨道分配与运动参数。
 *
 * 滚动弹幕的运动参数如下。
 *
 * ```text
 * a        = tz(容器宽度, 弹幕宽度, 默认 4.5 秒)
 * speed    = (容器宽度 + 弹幕宽度) / a * speedPlus
 * startX   = ceil(容器宽度 + 1) + 50
 * move     = ceil(startX + 弹幕宽度 + 50)
 * duration = ceil(move / speed * 100) / 100
 * middle   = 开始时刻 + startX / speed
 * ```
 *
 * 50 为 B 站网页端的安全边距，`tz` 的分段表与 B 站网页端一致。
 * 扫描规则与 B 站网页端一致，自上而下取第一个空闲槽位。
 * 放不下时丢弃该条，不排队，也不重叠。
 */

/** B 站网页端留给弹幕进出画面的安全边距，CSS 像素。 */
const SAFE_LEFT = 50;
const SAFE_RIGHT = 50;
/** 一条弹幕穿过画面所需的时长的分段表，来自 `tz()`。 */
const DURATION_TABLE = [
  { boundary: 558, maxTime: 13, minTime: 7 },
  { boundary: 888, maxTime: 14, minTime: 8 },
  { boundary: 1082, maxTime: 14, minTime: 9 },
  { boundary: 1246, maxTime: 15, minTime: 10 },
  { boundary: 1452, maxTime: 16, minTime: 11 },
  { boundary: 1744, maxTime: 18, minTime: 13 },
  { boundary: 2314, maxTime: 20, minTime: 14 },
  { boundary: 2560, maxTime: 22, minTime: 16 },
] as const;
/** 首个分段的边界，低于它的容器取默认时长。 */
const FIRST_BOUNDARY = 558;
/** 超长容器每多 500 像素，时长上下限各加一秒。 */
const LAST = { boundary: 2560, maxTime: 22, minTime: 16 };

/** B 站网页端默认的弹幕停留时长，秒。 */
export const DEFAULT_DURATION = 4.5;

/**
 * 分栏开始扫描轨道的起点 y，CSS 像素。
 *
 * B 站网页端默认的 `offsetTop` 为 4，播放器不传 `videoOffsetTop`，
 * 每个分栏都从 4 开始。
 */
export const OFFSET_TOP = 4;

/** B 站网页端的重叠余量，秒，见 `A = floor(duration * (1 - density) / 2) + 0.1`。 */
const OVERLAP_SLACK = 0.1;

export interface MotionTiming {
  /** 弹幕速度设置，B 站网页端的滑杆在 1 两侧覆盖 0.4 到 1.6。 */
  readonly speedPlus: number;
  /** `tz()` 在容器过小或宽度为零时使用的时长，秒。 */
  readonly defaultDuration: number;
}

export const DEFAULT_TIMING: MotionTiming = {
  speedPlus: 1,
  defaultDuration: DEFAULT_DURATION,
};

export interface PlacementRequest {
  readonly width: number;
  readonly height: number;
  /** 发起请求时的时钟读数，秒。 */
  readonly now: number;
  readonly containerWidth: number;
  readonly containerHeight: number;
  /** 显示区域，0 到 100。为 0 表示不设上限。 */
  readonly area: number;
}

/** 新弹幕落的位置，以及交给 DOM 的运动参数。 */
export interface Placement {
  readonly y: number;
  /** 滚动弹幕的起始 left，CSS 像素。 */
  readonly x: number;
  /** 滚动弹幕的 `--translateX`，负值，CSS 像素。 */
  readonly translateX: number;
  /** 动画时长，秒。 */
  readonly duration: number;
}

/** 已经占用的垂直空间。 */
interface Placed {
  readonly y: number;
  readonly bottom: number;
  /** 它完全离开的时刻，秒。 */
  readonly endTime: number;
}

/** 一条滚动中的弹幕，还要带上运动参数来判断会不会追尾。 */
interface Row extends Placed {
  /** 起始 left，CSS 像素。 */
  readonly x: number;
  readonly width: number;
  /** 像素每秒。 */
  readonly speed: number;
  /** 头部到达容器左边缘的时刻，秒。 */
  readonly middle: number;
}

/**
 * `tz()`：容器宽度与弹幕宽度决定的穿越时长，秒。
 *
 * B 站网页端的 `tz` 规则：容器宽度不超过 558 时取默认 4.5 秒，
 * 否则按分段表取上下限，并用弹幕宽度与容器宽度的比值做 logistic 插值。
 * 容器宽度超过 2560 时，每多 500 像素，上下限各加一秒。
 */
export function tz(
  containerWidth: number,
  width: number,
  defaultDuration = DEFAULT_DURATION,
): number {
  if (!containerWidth || !width || containerWidth < FIRST_BOUNDARY) {
    return defaultDuration;
  }
  const bounds =
    containerWidth > LAST.boundary
      ? {
          max:
            LAST.maxTime + Math.floor((containerWidth - LAST.boundary) / 500),
          min:
            LAST.minTime + Math.floor((containerWidth - LAST.boundary) / 500),
        }
      : findBounds(containerWidth);

  if (bounds === undefined) {
    return defaultDuration;
  }
  const span = (bounds.max - bounds.min) / 0.1 - 1;
  const pivot = Math.log(span) / 0.2 + 0.2;
  const ratio = width / containerWidth;
  const duration =
    bounds.min +
    (bounds.max - bounds.min) / (1 + Math.exp(-0.2 * (ratio - pivot)));

  return duration || defaultDuration;
}

/** 容器宽度落在分段表的哪一档。 */
function findBounds(
  containerWidth: number,
): { max: number; min: number } | undefined {
  const index = DURATION_TABLE.findIndex(
    (entry, index) => index > 0 && containerWidth <= entry.boundary,
  );
  const previous = index === -1 ? undefined : DURATION_TABLE[index - 1];

  return previous === undefined
    ? undefined
    : { max: previous.maxTime, min: previous.minTime };
}

/**
 * 插入一行，并保持列表按 bottom 有序。
 *
 * B 站网页端的 `binsert(t, sortFn)` 按 `bottom` 与 `endTime` 排序。
 * 该顺序是扫描正确性的前提，扫描在第一条起点低于候选槽位的行处停止。
 * 列表无序时会跳过后面的行，导致已占用的槽位被重复分配。
 */
function binsert<Entry extends Placed>(rows: Entry[], row: Entry): void {
  rows.push(row);
  rows.sort(
    (left, right) => left.bottom - right.bottom || left.endTime - right.endTime,
  );
}

/**
 * 自上而下放置滚动弹幕，并按实测高度打包。
 *
 * 实例保存当前已占用的行，后续放置据此判断空闲轨道。该状态有意设计为可变。
 */
export class SpaceManager {
  private rows: Row[] = [];
  private readonly timing: MotionTiming;

  constructor(timing: MotionTiming = DEFAULT_TIMING) {
    this.timing = timing;
  }

  /** 给这条弹幕占一行，B 站网页端会丢弃它时返回 `null`。 */
  add(request: PlacementRequest): Placement | null {
    const width = Math.max(0, request.width);
    const height = Math.max(0, request.height);
    const containerWidth = Math.max(1, request.containerWidth);
    const now = request.now;
    const crossing = tz(containerWidth, width, this.timing.defaultDuration);
    const speed = Math.max(
      1e-6,
      ((containerWidth + width) / crossing) * this.timing.speedPlus,
    );
    const startX = Math.ceil(containerWidth + 1) + SAFE_RIGHT;
    const move = Math.ceil(startX + width + SAFE_LEFT);
    const duration = Math.ceil((move / speed) * 100) / 100;
    const middle = now + startX / speed;
    const endTime = now + duration;

    // 已离开该层的条目不再占用轨道。
    this.rows = this.rows.filter(row => row.endTime > now);

    const layerHeight = Math.max(0, request.containerHeight) + 1;
    const areaLimit = (layerHeight * Math.max(0, request.area)) / 100;
    const y =
      this.rows.length === 0
        ? OFFSET_TOP
        : this.scan(areaLimit, layerHeight, height, now, middle, startX);

    if (y === null) {
      return null;
    }
    binsert(this.rows, {
      x: startX,
      width,
      speed,
      middle,
      endTime,
      y,
      bottom: y + height,
    });

    return { y, x: startX, translateX: -move, duration };
  }

  /** 扫描一个能装下 `height` 的 y，层满或超出显示区域时返回 `null`。 */
  private scan(
    areaLimit: number,
    layerHeight: number,
    height: number,
    now: number,
    middle: number,
    startX: number,
  ): number | null {
    const scan = (index: number, y: number): number | null => {
      const bottom = y + height;

      if (bottom > layerHeight) {
        return null;
      }
      const row = this.rows[index];

      if (row === undefined) {
        return y;
      }

      if (row.bottom <= y) {
        return scan(index + 1, y);
      }

      if (row.y > bottom) {
        return y;
      }

      if (this.shares(row, index, now, middle, startX, y, bottom)) {
        return y;
      }
      const next = row.bottom + 1;

      // B 站网页端在让位之后才检查显示区域，超出就丢弃。
      if (areaLimit > 0 && next + height > areaLimit) {
        return null;
      }
      return scan(index + 1, next);
    };
    return scan(0, OFFSET_TOP);
  }

  /** B 站网页端的碰撞判断：`t.x > s.x + s.width && t.middle > s.endTime + A`。 */
  private shares(
    row: Row,
    index: number,
    now: number,
    middle: number,
    startX: number,
    top: number,
    bottom: number,
  ): boolean {
    const rowX = (row.middle - now) * row.speed;

    return (
      startX > rowX + row.width &&
      middle > row.endTime + OVERLAP_SLACK &&
      !this.hasDm(index + 1, top, bottom)
    );
  }

  /** B 站网页端的 `hasDm`：更下方是否还有一条也重叠。 */
  private hasDm(from: number, top: number, bottom: number): boolean {
    const row = this.rows.find(
      (entry, index) => index >= from && entry.bottom >= top,
    );

    return row !== undefined && row.y <= bottom;
  }
}
