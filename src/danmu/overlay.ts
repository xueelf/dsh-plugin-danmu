/**
 * 弹幕渲染引擎。
 *
 * 复刻 B 站网页端的弹幕元素与动画。视频弹幕使用绝对定位的 `div`，
 * 运动由 CSS 动画（`@keyframes roll`）完成，canvas 的 `shot()` 仅用于截图。
 * 每条弹幕的元素携带 `--fontSize`、`--textShadow` 等变量，
 * 加入 `-show` 类后开始动画。
 *
 * 本文件不依赖 React，视图层只负责把容器交给引擎。
 */

import { type TextData, Mode } from '../conversation/decoder';
import type { DanmuSettings } from '../stores/settings-store';
import { CenterAllocator } from './center';
import { getFontSize, REFERENCE_SIZE } from './font';
import type { ConversationBoxStore } from './region';
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
  private readonly region: ConversationBoxStore;
  private readonly elements = new Set<HTMLDivElement>();
  private readonly timers = new Set<number>();
  private options: DanmuSettings;
  private layout: SpaceManager;
  private center: CenterAllocator;
  private scale: {
    readonly key: string;
    readonly scale: SizeScale | null;
  } | null = null;

  constructor(
    container: HTMLElement,
    region: ConversationBoxStore,
    options: DanmuSettings,
  ) {
    this.container = container;
    this.region = region;
    this.options = options;
    this.layout = new SpaceManager({
      speedPlus: options.speedPlus,
      defaultDuration: DEFAULT_TIMING.defaultDuration,
    });
    this.center = new CenterAllocator();
  }

  /** 新设置只影响之后创建的弹幕，已渲染元素保持原样。 */
  setOptions(options: DanmuSettings): void {
    this.options = options;
    this.layout.setSpeedPlus(options.speedPlus);
  }

  /** 移除当前全部弹幕并清空轨道状态。 */
  clear(): void {
    for (const timer of this.timers) {
      window.clearTimeout(timer);
    }
    this.timers.clear();

    for (const element of this.elements) {
      element.remove();
    }
    this.elements.clear();
    this.layout = new SpaceManager({
      speedPlus: this.options.speedPlus,
      defaultDuration: DEFAULT_TIMING.defaultDuration,
    });
    this.center = new CenterAllocator();
  }

  /** 销毁引擎。 */
  destroy(): void {
    this.clear();
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

  /** 追加一条弹幕。 */
  push(textData: TextData): void {
    if (textData.mode !== Mode.Roll && textData.mode !== Mode.Top) {
      return;
    }
    const current = this.options;

    this.region.refresh();

    const container = this.container;
    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;

    if (containerWidth <= 0 || containerHeight <= 0) {
      return;
    }
    const now = performance.now() / 1000;
    const fontPx = getFontSize(
      REFERENCE_SIZE,
      containerHeight,
      current.fontSize,
      FULL_SCREEN_SYNC,
    );
    const textScale = this.scaleFor(container);
    const element = document.createElement('div');

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
    container.append(element);

    const measured = textSize(textData.text, fontPx, textScale, () => {
      const rect = element.getBoundingClientRect();

      return { width: rect.width, height: rect.height };
    });

    if (textData.mode === Mode.Top) {
      const y = this.center.add({
        height: measured.height,
        now,
        containerHeight,
        area: current.area,
      });

      if (y === null) {
        element.remove();

        return;
      }
      this.elements.add(element);
      element.style.cssText += `--translateY:${y}px;`;
      element.classList.add(`${DANMU_CLASS}-center`, `${DANMU_CLASS}-show`);
      this.removeAfter(element, DEFAULT_DURATION);

      return;
    }
    const placement = this.layout.add({
      width: measured.width,
      height: measured.height,
      now,
      containerWidth,
      containerHeight,
      area: current.area,
    });

    if (placement === null) {
      element.remove();

      return;
    }
    this.elements.add(element);
    element.style.cssText +=
      `--offset:${placement.x}px;` +
      `--translateX:${placement.translateX}px;` +
      `--duration:${placement.duration}s;` +
      `--top:${placement.y}px;`;
    element.classList.add(`${DANMU_CLASS}-roll`, `${DANMU_CLASS}-show`);
    this.removeAfter(element, placement.duration);
  }

  private removeAfter(node: HTMLDivElement, seconds: number): void {
    const timer = window.setTimeout(() => {
      node.remove();
      this.elements.delete(node);
      this.timers.delete(timer);
    }, seconds * 1000);

    this.timers.add(timer);
  }
}
