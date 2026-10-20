/**
 * 弹幕的活动区域。
 *
 * 浮层位于覆盖整帧的 `shell.overlay` 层，
 * 弹幕必须限制在 Conversation 的内容区之内，
 * 即头部下方、栏的下边缘之上，并避开两侧边栏。
 * Client API 不公开该矩形，直接读取宿主 DOM 并推断其结构不符合插件约束，
 * 宿主类名由构建生成，可能随时变化。
 *
 * 本 bundle 通过 additive 列表槽位注册两个标记点并测量其矩形。
 * 标记点属于本 bundle，位置由 Conversation 的布局决定。
 *
 * - `conversation.session.header.utilities` 位于头部首行，
 *   标记点横跨该行，其下边缘为内容区上边界。
 * - `conversation.input.dock` 在输入框上方满宽布局，
 *   标记点的矩形给出栏的横向范围。
 *
 * 下边界取头部标记点所在栏的下边缘。
 * 输入框在栏内增高，栏本身不变，该边界不随输入框变化。
 * 输入框与底部信息栏均位于区域内，与视频画面中的浮层一致。
 *
 * 横向范围由 Conversation 的网格轨道决定。
 * 展开右侧栏时，两个标记点随所在栏一同变窄。
 */

/** 两个测量标记点，分别提供内容区上边界与栏的横向范围。 */
export type RegionPart = 'content-top' | 'content-bottom';

/** Conversation 的内容区，视口坐标。 */
export interface ConversationBox {
  /** 栏左边缘的视口 x。 */
  readonly left: number;
  /** 栏的宽度。 */
  readonly width: number;
  /** 头部正下方的视口 y。 */
  readonly top: number;
  /** 栏的下边缘的视口 y。 */
  readonly bottom: number;
}

/** 与 `ConversationBox` 同一套视口坐标里的一个点。 */
export interface ViewportPoint {
  readonly left: number;
  readonly top: number;
}

/** 弹幕带在层内的位置，层坐标。 */
export interface BandRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 一次测量中参与区域计算的字段，视口坐标。
 *
 * 横向范围由两个标记点提供，上边界与栏的下边缘仅由头部标记点提供。
 */
interface MeasuredRect {
  readonly left: number;
  readonly width: number;
  /** 内容区上边界，即头部的下边缘。 */
  readonly contentTop?: number;
  /** 头部标记点所在栏的下边缘。 */
  readonly columnBottom?: number;
}

/** 头部读数可信所需的最小内容区高度。 */
const MIN_CONTENT_HEIGHT = 40;
/** 头部区域的最大高度，超过该值即为 Conversation 的栏。 */
const HEADER_MAX_HEIGHT = 200;
/** 栏能在标记点周围内缩、仍算作这一栏的最大距离。 */
const MAX_COLUMN_PADDING = 64;

/** 将内容区映射为层内坐标。 */
export function bandRect(
  box: ConversationBox,
  origin: ViewportPoint,
): BandRect {
  const top = Math.max(0, box.top - origin.top);
  const bottom = Math.max(top, box.bottom - origin.top);

  return {
    left: box.left - origin.left,
    top,
    width: Math.max(0, box.width),
    height: bottom - top,
  };
}

/**
 * 跟踪两个标记点，并发布计算出的内容区。
 *
 * 标记点可能因布局变化而移动，但其自身尺寸不变，例如输入框在标记点下方增高。
 * `refresh` 用于声明布局可能已变化，浮层在产生弹幕前调用，以获取最新读数。
 */
export class ConversationBoxStore {
  private readonly elements = new Map<RegionPart, HTMLElement>();
  private readonly rects = new Map<RegionPart, MeasuredRect>();
  private readonly stopObserving = new Map<RegionPart, () => void>();
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private measuredAt = 0;

  /** 开始测量标记点。传入 `null` 时停止跟踪并丢弃其测量结果。 */
  observe(part: RegionPart, element: HTMLElement | null): void {
    if (this.elements.get(part) === element) {
      return;
    }
    this.stopObserving.get(part)?.();
    this.stopObserving.delete(part);
    this.elements.delete(part);
    this.rects.delete(part);

    if (element === null) {
      this.publish();

      return;
    }
    this.elements.set(part, element);

    const measure = () => this.measure(part);
    const observer = new ResizeObserver(measure);

    observer.observe(element);

    if (element.parentElement !== null) {
      observer.observe(element.parentElement);
    }
    window.addEventListener('resize', measure);
    this.stopObserving.set(part, () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    });
    measure();
  }

  refresh(maxAgeMs = 150): void {
    if (performance.now() - this.measuredAt < maxAgeMs) {
      return;
    }

    for (const part of [...this.elements.keys()]) {
      this.measure(part);
    }
  }

  /**
   * 返回内容区，Conversation 未显示时返回 `null`。
   *
   * 上边界取自头部标记点，下边界取自其所在栏的下边缘。
   * 两个标记点均完成测量前不返回区域，输入框高度变化不会影响任何边界。
   */
  read(): ConversationBox | null {
    const column = this.rects.get('content-bottom');
    const header = this.rects.get('content-top');

    if (
      column === undefined ||
      column.width <= 0 ||
      header === undefined ||
      header.contentTop === undefined ||
      header.columnBottom === undefined ||
      header.columnBottom - header.contentTop < MIN_CONTENT_HEIGHT
    ) {
      return null;
    }
    return {
      left: column.left,
      width: column.width,
      top: Math.max(0, header.contentTop),
      bottom: header.columnBottom,
    };
  }

  /**
   * 单调递增的版本号，作为 `useSyncExternalStore` 的稳定快照。
   * 声明为箭头属性，因为 React 调用时不保留实例上下文。
   */
  getSnapshot = (): number => this.version;

  /**
   * 订阅版本号变化，返回退订函数。
   *
   * 与 `getSnapshot` 相同，声明为箭头属性。
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  private measure(part: RegionPart): void {
    const element = this.elements.get(part);

    if (element === undefined) {
      return;
    }
    const rect = element.getBoundingClientRect();

    this.measuredAt = performance.now();

    // 标记点填满槽位的内容盒，栏可能在该盒之外另行内缩。
    // 弹幕以栏的边缘为起点，不采用内缩后的边界。
    const span =
      part === 'content-bottom'
        ? columnSpan(element, rect)
        : { left: rect.left, width: rect.width };
    // 头部标记点位于头部第一行，内容区起点在整个头部下方。
    // 标记点自身的下边缘并非内容区上边界。
    const header =
      part === 'content-top' ? headerBounds(element, rect.bottom) : null;
    const previous = this.rects.get(part);
    const next: MeasuredRect =
      header === null
        ? { left: span.left, width: span.width }
        : {
            left: span.left,
            width: span.width,
            contentTop: header.bottom,
            columnBottom: header.columnBottom,
          };

    this.rects.set(part, next);

    if (previous === undefined || !sameRect(part, previous, next)) {
      this.publish();
    }
  }

  private publish(): void {
    this.version += 1;

    for (const listener of this.listeners) {
      listener();
    }
  }
}

/**
 * 判断两次测量结果是否等价。
 *
 * 只比较会进入区域的字段。上边界与栏的下边缘由头部标记点提供，
 * 横向范围由输入框标记点提供。
 * 输入框增高会改变其上下位置，但该位置不参与区域计算，不触发发布。
 */
function sameRect(
  part: RegionPart,
  left: MeasuredRect,
  right: MeasuredRect,
): boolean {
  return part === 'content-top'
    ? left.contentTop === right.contentTop &&
        left.columnBottom === right.columnBottom
    : left.left === right.left && left.width === right.width;
}

/** 由近及远收集一个元素的全部祖先。 */
function ancestorsOf(element: HTMLElement): HTMLElement[] {
  const parent = element.parentElement;

  return parent === null ? [] : [parent, ...ancestorsOf(parent)];
}

/**
 * 标记点所在栏的横向范围。
 *
 * 标记点填满槽位的内容盒，栏可能在该盒之外另行内缩。
 * 对话滚动区会为自己保留边槽，使槽位左边对齐、右边偏短。
 * 祖先仍在标记点 {@link MAX_COLUMN_PADDING} 的距离内时，
 * 继续向上遍历并保留最宽的祖先。
 * 判定由纯函数 {@link pickColumnSpan} 完成，并使用实际测量数据测试。
 *
 * 该距离是遍历的终止条件，祖先超出标记点一个内边距后便不属于本栏。
 * 侧栏占据网格轨道时，该祖先即为整帧，此时停止遍历，
 * 避免将活动区域扩展到侧栏之上。
 */
function columnSpan(
  element: HTMLElement,
  marker: DOMRect,
): { left: number; width: number } {
  const ancestors = ancestorsOf(element).map(node => {
    const rect = node.getBoundingClientRect();

    return { left: rect.left, width: rect.width };
  });

  return pickColumnSpan({ left: marker.left, width: marker.width }, ancestors);
}

/** 该祖先是否已超出标记点一个内边距的距离。 */
function outOfReach(marker: AncestorBox, rect: AncestorBox): boolean {
  const before = marker.left - rect.left;
  const after = rect.left + rect.width - (marker.left + marker.width);

  return (
    before < 0 ||
    after < 0 ||
    before > MAX_COLUMN_PADDING ||
    after > MAX_COLUMN_PADDING
  );
}

/** 向上遍历时考察的一个祖先，只保留其横向盒子。 */
export interface AncestorBox {
  readonly left: number;
  readonly width: number;
}

/**
 * 返回仍在标记点一个内边距距离内的最宽祖先盒子。
 *
 * 无盒子的祖先在布局上透明，例如 `display: contents` 的槽位包装层。
 * 其矩形全为零，向上遍历应穿过这类祖先，不将其视为边界，
 * 否则会在第一个槽位包装层处停止。
 */
export function pickColumnSpan(
  marker: AncestorBox,
  ancestors: readonly AncestorBox[],
): AncestorBox {
  const columnIndex = ancestors.findIndex(rect =>
    rect.width > 0 ? outOfReach(marker, rect) : false,
  );
  const columnAncestors =
    columnIndex === -1 ? ancestors : ancestors.slice(0, columnIndex);

  return columnAncestors.reduce<AncestorBox>(
    (widest, rect) =>
      rect.width > widest.width
        ? { left: rect.left, width: rect.width }
        : widest,
    marker,
  );
}

/**
 * 计算头部的下边缘，以及头部所在栏的下边缘。
 *
 * 头部由标题行与 View 标签页组成，标记点位于第一行。
 * 祖先中高度超过 {@link HEADER_MAX_HEIGHT} 的第一个元素即 Conversation 的栏，
 * 遍历在该元素处终止。该判断不依赖类名与固定层数。
 * 若不存在这样的祖先，栏的下边缘为 `undefined`，
 * `read` 返回 `null`，不抛出错误。
 *
 * 栏的下边缘是内容区的实际下边界，输入框与底部信息栏均位于其内。
 */
function headerBounds(
  element: HTMLElement,
  markerBottom: number,
): { bottom: number; columnBottom?: number } {
  const rects = ancestorsOf(element).map(node => node.getBoundingClientRect());
  const columnIndex = rects.findIndex(rect => rect.height > HEADER_MAX_HEIGHT);
  const headerAncestors =
    columnIndex === -1 ? rects : rects.slice(0, columnIndex);
  const bottom = headerAncestors.reduce(
    (furthest, rect) => Math.max(furthest, rect.bottom),
    markerBottom,
  );

  return {
    bottom,
    columnBottom: columnIndex === -1 ? undefined : rects[columnIndex]?.bottom,
  };
}
