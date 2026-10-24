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
 *   标记点给出栏的横向范围。
 *
 * `ConversationRoot` 用 `display: contents` 把 header 和 content 包在
 * 同一个会话根下，最近公共祖先没有盒子，继续向上就是会话栏。
 * 区域取两个标记点的第一个有尺寸的公共祖先，头部上边界取标记点到
 * 会话栏之前所有祖先 `bottom` 的最大值。这里不需要高度或宽度阈值。
 *
 * 长度测量使用 `ResizeObserver` 与 `getBoundingClientRect`，
 * 与 `dsh-client-ui-layout`、`dsh-client-ui-conversation` 的测量方式一致。
 *
 * 该区域是 DSH 适配层，不是 B 站弹幕规则。B 站播放器由宿主调用
 * `manager.resize` 下发 `containerSize`（来源：npd.491），DSH 不提供
 * 内容区矩形，只能由两个标记点推断。
 *
 * `ResizeObserver` 不感知位移，未观察祖先的纯位移会让区域保持旧值
 * 到下一次触发。这是缺失矩形 API 的已知限制，不以插入时测量或轮询弥补。
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

/** 参与公共祖先判断的最小盒子。 */
export interface BoxSize {
  readonly width: number;
  readonly height: number;
}

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
 * 找到 `topAncestors` 里第一个同时出现在 `bottomAncestors` 中、
 * 且自身有尺寸的祖先下标。
 *
 * 没有盒子（例如 `display: contents` 的会话根）的公共祖先必须跳过，
 * 继续向上找到真正参与布局的会话栏。
 */
export function firstMeasuredCommonIndex(
  topAncestors: readonly unknown[],
  bottomAncestors: ReadonlySet<unknown>,
  boxes: readonly BoxSize[],
): number {
  for (let index = 0; index < topAncestors.length; index += 1) {
    const box = boxes[index];

    if (
      box !== undefined &&
      box.width > 0 &&
      box.height > 0 &&
      bottomAncestors.has(topAncestors[index])
    ) {
      return index;
    }
  }
  return -1;
}

/**
 * 头部下边缘：标记点自身 bottom 与到会话栏之前所有祖先 bottom 的最大值。
 *
 * 头部的标题行、View 标签页等都在这个范围内，不需要猜测头部最大高度。
 */
export function headerBottomBelow(
  markerBottom: number,
  ancestorBottoms: readonly number[],
): number {
  return ancestorBottoms.reduce(
    (bottom, value) => Math.max(bottom, value),
    markerBottom,
  );
}

/** 由近及远收集一个元素的全部祖先。 */
function ancestorsOf(element: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];

  let node = element.parentElement;

  while (node !== null) {
    ancestors.push(node);
    node = node.parentElement;
  }
  return ancestors;
}

/** 找到两个标记点之间第一个有尺寸的公共祖先。 */
function findColumn(
  top: HTMLElement,
  bottom: HTMLElement,
): { readonly element: HTMLElement; readonly box: DOMRect } | null {
  const topAncestors = ancestorsOf(top);
  const bottomAncestors = new Set(ancestorsOf(bottom));
  const boxes = topAncestors.map(node => node.getBoundingClientRect());
  const index = firstMeasuredCommonIndex(topAncestors, bottomAncestors, boxes);
  const element = index === -1 ? undefined : topAncestors[index];
  const box = index === -1 ? undefined : boxes[index];

  if (element === undefined || box === undefined) {
    return null;
  }
  return { element, box };
}

/**
 * 头部标记点到会话栏之前所有祖先的 bottom。
 *
 * 返回 `null` 表示标记点不在会话栏内，区域不成立。
 */
function headerBottom(top: HTMLElement, column: HTMLElement): number | null {
  const marker = top.getBoundingClientRect();
  const bottoms: number[] = [];

  let node = top.parentElement;

  while (node !== null && node !== column) {
    bottoms.push(node.getBoundingClientRect().bottom);
    node = node.parentElement;
  }

  if (node !== column) {
    return null;
  }
  return headerBottomBelow(marker.bottom, bottoms);
}

/** 计算一次内容区。 */
function measureRegion(
  top: HTMLElement,
  bottom: HTMLElement,
): ConversationBox | null {
  const column = findColumn(top, bottom);

  if (column === null || column.box.width <= 0 || column.box.height <= 0) {
    return null;
  }
  const contentTop = headerBottom(top, column.element);

  if (contentTop === null || column.box.bottom <= contentTop) {
    return null;
  }
  return {
    left: column.box.left,
    width: column.box.width,
    top: contentTop,
    bottom: column.box.bottom,
  };
}

/** 两次内容区是否等价。 */
function sameRegion(
  left: ConversationBox | null,
  right: ConversationBox | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.left === right.left &&
    left.width === right.width &&
    left.top === right.top &&
    left.bottom === right.bottom
  );
}

/**
 * 跟踪两个标记点，发布计算出的内容区。
 *
 * 标记点及其父元素共用一个 `ResizeObserver`，接元素尺寸变化；一条
 * `resize` 监听接只改位置、不改已观察元素尺寸的窗口级变化。
 * 弹幕引擎只读该区域，插入时不触发测量。区域是推断值，限制见文件头。
 */
export class ConversationBoxStore {
  private readonly elements = new Map<RegionPart, HTMLElement>();
  private readonly listeners = new Set<() => void>();
  private observer: ResizeObserver | null = null;
  private listening = false;
  private region: ConversationBox | null = null;
  private version = 0;

  /** 开始测量标记点。传入 `null` 时停止跟踪并丢弃其测量结果。 */
  observe(part: RegionPart, element: HTMLElement | null): void {
    if (this.elements.get(part) === element) {
      return;
    }
    this.elements.delete(part);

    if (element !== null) {
      this.elements.set(part, element);
    }
    this.syncObservation();
    this.update();
  }

  /**
   * 合并观察目标。
   *
   * 原实现每个标记点各建一个 `ResizeObserver` 和一条 `resize` 监听，
   * 一次窗口变化最多完整测量四次。合并后减半，时机和结果不变。
   */
  private syncObservation(): void {
    const elements = [...this.elements.values()];

    this.observer?.disconnect();
    this.observer = null;

    if (elements.length === 0) {
      this.removeResizeListener();

      return;
    }
    const observer = new ResizeObserver(() => this.update());

    for (const element of elements) {
      observer.observe(element);

      if (element.parentElement !== null) {
        observer.observe(element.parentElement);
      }
    }
    this.observer = observer;
    this.addResizeListener();
  }

  private addResizeListener(): void {
    if (this.listening) {
      return;
    }
    window.addEventListener('resize', this.onResize);
    this.listening = true;
  }

  private removeResizeListener(): void {
    if (!this.listening) {
      return;
    }
    window.removeEventListener('resize', this.onResize);
    this.listening = false;
  }

  private readonly onResize = (): void => {
    this.update();
  };

  /**
   * 返回内容区，Conversation 未显示时返回 `null`。
   *
   * 两个标记点都在、且能找到有尺寸的公共会话栏时才返回区域。
   */
  read(): ConversationBox | null {
    return this.region;
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

  private update(): void {
    const top = this.elements.get('content-top');
    const bottom = this.elements.get('content-bottom');
    const next =
      top === undefined || bottom === undefined
        ? null
        : measureRegion(top, bottom);

    if (sameRegion(this.region, next)) {
      return;
    }
    this.region = next;
    this.version += 1;

    for (const listener of this.listeners) {
      listener();
    }
  }
}
