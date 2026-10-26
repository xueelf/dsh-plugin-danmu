/**
 * 弹幕渲染引擎。
 *
 * 复刻 B 站网页端的弹幕元素与动画。视频弹幕使用绝对定位的 `div`，
 * 运动由 CSS 动画（`@keyframes roll`）完成，canvas 的 `shot()` 仅用于截图。
 * 每条弹幕的元素携带 `--fontSize`、`--textShadow` 等变量，
 * 加入 `-show` 类后开始动画。
 *
 * 容器尺寸由浮层写入快照，插入时只读快照，
 * 与 B 站播放器的 `manager.containerSize` 一致。
 * 元素在动画结束后清空并回池，与渲染器的 `cycleDoms` 一致。
 *
 * 本文件不依赖 React，视图层只负责把容器交给引擎。
 */

import { type TextData, Mode } from '../conversation/decoder';
import { type DanmuSettings, effectiveArea } from '../stores/settings-store';
import { bottomOffset, CenterAllocator } from './center';
import { getFontSize, REFERENCE_SIZE } from './font';
import { rollDanmuLimit, RollDanmuRateLimiter } from './rate-limit';
import {
  DEFAULT_DURATION,
  DEFAULT_TIMING,
  SpaceManager,
} from './space-manager';
import { type SizeScale, measureSizeScale, textSize } from './text';

export const DANMU_CLASS = 'dsh-danmu';

/** B 站网页端给字体族追加的回落列表。 */
const FAMILY_FALLBACK = ', Arial, Helvetica, sans-serif';
/** 随屏缩放，B 站网页端默认开启。 */
const FULL_SCREEN_SYNC = true;
/** B 站网页端在 Windows 下的出厂字体族。 */
const FAMILY = "SimHei, 'Microsoft JhengHei'";
/** B 站网页端默认加粗。 */
const BOLD = true;
/** B 站网页端默认描边类型：四向 1px 投影。 */
const FONT_BORDER = 0;
/**
 * B 站渲染器的帧循环频率，来源：npd.491 的 `nextFrame({ fps: 30 })`。
 * 销毁在帧回调里统一处理，不再给每条弹幕挂定时器。
 */
const FRAME_FPS = 30;
const FRAME_INTERVAL = 1000 / FRAME_FPS;

/** 描边颜色，与 B 站网页端的 `outlineColor` 一致：文字为黑时返回白，否则返回黑。 */
function outlineColor(color: number): number {
  return color === 0 ? 0xffffff : 0;
}

/** 描边投影，与 B 站网页端的 `getShadow` 一致。 */
function getShadow(color: number, fontBorder: number): string {
  const rgb = outlineColor(color).toString(16).padStart(6, '0');
  const hex = `#${rgb}`;

  return fontBorder === 1
    ? `0px 0px 1px ${hex},0 0 1px ${hex},0 0 1px ${hex}`
    : fontBorder === 2
      ? `1px 1px 2px ${hex},0 0 1px ${hex}`
      : `1px 0 1px ${hex},0 1px 1px ${hex},0 -1px 1px ${hex},-1px 0 1px ${hex}`;
}

/** 在给定容器里创建、排版和移除弹幕元素。 */
export class DanmuOverlayEngine {
  private readonly container: HTMLElement;
  private readonly active = new Map<
    HTMLDivElement,
    {
      readonly mode: Mode;
      readonly endTime: number;
      readonly bottomY: number | null;
    }
  >();
  private readonly pools = new Map<Mode, HTMLDivElement[]>();
  private readonly rate = new RollDanmuRateLimiter();
  private frame: number | null = null;
  private framePrev = 0;
  private options: DanmuSettings;
  private layout: SpaceManager;
  private center: CenterAllocator;
  private bottomCenter: CenterAllocator;
  private containerWidth = 0;
  private containerHeight = 0;
  private scale: {
    readonly key: string;
    readonly scale: SizeScale | null;
  } | null = null;

  constructor(container: HTMLElement, options: DanmuSettings) {
    this.container = container;
    this.options = options;
    this.layout = new SpaceManager({
      speedPlus: options.speedPlus,
      defaultDuration: DEFAULT_TIMING.defaultDuration,
    });
    this.center = new CenterAllocator();
    this.bottomCenter = new CenterAllocator();
  }

  /**
   * 写入容器尺寸快照。
   *
   * 对应 B 站的 `manager.resize()` 与 `containerSize`
   * （来源：npd.491 的 `resize` 与 `beforeCollisionCheck`），
   * 插入时只读快照，不测量容器。底部弹幕按高度差平移，
   * 与底部类的 `resize` 一致。
   */
  setContainerSize(width: number, height: number): void {
    const delta = height - this.containerHeight;

    this.containerWidth = width;
    this.containerHeight = height;

    if (delta === 0) {
      return;
    }

    for (const [element, entry] of this.active) {
      if (entry.bottomY === null) {
        continue;
      }
      const next = entry.bottomY + delta;

      this.active.set(element, { ...entry, bottomY: next });
      element.style.setProperty('--translateY', `${next}px`);
    }
  }

  /** 新设置只影响之后创建的弹幕，已渲染元素保持原样。 */
  setOptions(options: DanmuSettings): void {
    this.options = options;
    this.layout.setSpeedPlus(options.speedPlus);
  }

  /** 回收当前全部弹幕，清空轨道状态和速率窗口。 */
  clear(): void {
    for (const [element, entry] of this.active) {
      this.release(entry.mode, element);
    }
    this.active.clear();
    this.rate.reset();
    this.stopFrame();
    this.layout = new SpaceManager({
      speedPlus: this.options.speedPlus,
      defaultDuration: DEFAULT_TIMING.defaultDuration,
    });
    this.center = new CenterAllocator();
    this.bottomCenter = new CenterAllocator();
  }

  /** 销毁引擎，连同池里的元素一起移除。 */
  destroy(): void {
    this.clear();

    for (const pool of this.pools.values()) {
      for (const element of pool) {
        element.remove();
      }
    }
    this.pools.clear();
  }

  /** 字体的宽度基准，按字体族与字重缓存。 */
  private scaleFor(container: HTMLElement): SizeScale | null {
    const key = `${FAMILY}|${BOLD}`;

    if (this.scale?.key === key) {
      return this.scale.scale;
    }
    const scale = measureSizeScale(container, FAMILY, BOLD);

    if (scale !== null) {
      this.scale = { key, scale };
    }
    return scale;
  }

  /**
   * 取一个可复用元素。对应 B 站的 `cycleDoms`
   * （来源：npd.491 的元素构造与 `destroy()`），回收的 div 留在容器里复用。
   */
  private acquire(mode: Mode): HTMLDivElement {
    const element = this.pools.get(mode)?.pop();

    if (element !== undefined) {
      return element;
    }
    const created = document.createElement('div');

    this.container.append(created);

    return created;
  }

  /** 清空元素并放回对应模式的池子。 */
  private release(mode: Mode, element: HTMLDivElement): void {
    element.className = '';
    element.textContent = '';
    element.style.cssText = '';

    const pool = this.pools.get(mode);

    if (pool === undefined) {
      this.pools.set(mode, [element]);

      return;
    }
    pool.push(element);
  }

  /** 登记元素，交给帧循环在 `endTime` 之后回收。 */
  private activate(
    mode: Mode,
    element: HTMLDivElement,
    endTime: number,
    bottomY: number | null = null,
  ): void {
    this.active.set(element, { mode, endTime, bottomY });
    this.startFrame();
  }

  /**
   * 启动 30fps 帧循环。
   *
   * 对应 B 站渲染器的帧驱动销毁（来源：npd.491 的 `e4` 节流 rAF 与
   * `everyFrame("end")` 里的 `manager.render`）。没有弹幕时停掉，避免空转。
   */
  private startFrame(): void {
    if (this.frame !== null) {
      return;
    }
    this.framePrev = performance.now();
    this.frame = window.requestAnimationFrame(this.tick);
  }

  /** 停止帧循环。 */
  private stopFrame(): void {
    if (this.frame === null) {
      return;
    }
    window.cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  /** 每帧检查过期弹幕，没有存活弹幕时停止循环。 */
  private readonly tick = (time: number): void => {
    const elapsed = time - this.framePrev;

    if (elapsed >= FRAME_INTERVAL) {
      this.framePrev = time - (elapsed % FRAME_INTERVAL);
      this.expire(performance.now() / 1000);
    }

    if (this.active.size === 0) {
      this.frame = null;

      return;
    }
    this.frame = window.requestAnimationFrame(this.tick);
  };

  /** 回收已经到达 `endTime` 的弹幕。 */
  private expire(now: number): void {
    for (const [element, entry] of this.active) {
      if (entry.endTime > now) {
        continue;
      }
      this.active.delete(element);
      this.release(entry.mode, element);
    }
  }

  /** 追加一条弹幕。 */
  push(textData: TextData): void {
    const mode = textData.mode;

    if (mode !== Mode.Roll && mode !== Mode.Top && mode !== Mode.Bottom) {
      return;
    }
    const current = this.options;
    const containerWidth = this.containerWidth;
    const containerHeight = this.containerHeight;

    if (containerWidth <= 0 || containerHeight <= 0) {
      return;
    }
    const nowMs = performance.now();
    const now = nowMs / 1000;
    const area = effectiveArea(current.area, current.density);

    // B 站的每秒上限在碰撞检查之前生效，被碰撞丢弃的弹幕也占额度。
    if (mode === Mode.Roll) {
      const limit = rollDanmuLimit(area, containerHeight, current.fontSize);

      if (!this.rate.admit(nowMs, limit)) {
        return;
      }
    }
    const fontPx = getFontSize(
      REFERENCE_SIZE,
      containerHeight,
      current.fontSize,
      FULL_SCREEN_SYNC,
    );
    const textScale = this.scaleFor(this.container);
    const element = this.acquire(mode);

    element.className = DANMU_CLASS;
    element.textContent = textData.text;
    element.style.cssText =
      [
        `--opacity:${Math.max(current.opacity, 0.1)}`,
        `--fontSize:${fontPx}px`,
        `--fontFamily:${FAMILY}${FAMILY_FALLBACK}`,
        `--fontWeight:${BOLD ? 'bold' : 'normal'}`,
        '--color:#ffffff',
        `--textShadow:${getShadow(0xffffff, FONT_BORDER)}`,
      ].join(';') + ';';

    const measured = textSize(textData.text, fontPx, textScale, () => {
      const rect = element.getBoundingClientRect();

      return { width: rect.width, height: rect.height };
    });

    if (mode === Mode.Top) {
      const y = this.center.add({
        height: measured.height,
        now,
        containerHeight,
        area,
      });

      if (y === null) {
        this.release(mode, element);

        return;
      }
      element.style.cssText += `--translateY:${y}px;`;
      element.classList.add(`${DANMU_CLASS}-center`, `${DANMU_CLASS}-show`);
      this.activate(mode, element, now + DEFAULT_DURATION);

      return;
    }

    if (mode === Mode.Bottom) {
      // 底部弹幕：独立槽位分配后翻到容器底部。当前没有事件映射和
      // 设置入口，未来按消息类型配置位置时直接复用这个分支。
      const top = this.bottomCenter.add({
        height: measured.height,
        now,
        containerHeight,
        area,
      });

      if (top === null) {
        this.release(mode, element);

        return;
      }
      const y = bottomOffset(containerHeight, measured.height, top);

      element.style.cssText += `--translateY:${y}px;`;
      element.classList.add(`${DANMU_CLASS}-center`, `${DANMU_CLASS}-show`);
      this.activate(mode, element, now + DEFAULT_DURATION, y);

      return;
    }
    const placement = this.layout.add({
      width: measured.width,
      height: measured.height,
      now,
      containerWidth,
      containerHeight,
      area,
    });

    if (placement === null) {
      this.release(mode, element);

      return;
    }
    element.style.cssText +=
      `--offset:${placement.x}px;` +
      `--translateX:${placement.translateX}px;` +
      `--duration:${placement.duration}s;` +
      `--top:${placement.y}px;`;
    element.classList.add(`${DANMU_CLASS}-roll`, `${DANMU_CLASS}-show`);
    this.activate(mode, element, now + placement.duration);
  }
}
