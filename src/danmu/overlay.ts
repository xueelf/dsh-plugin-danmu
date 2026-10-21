/**
 * 浮层，承载弹幕的 DOM 层。
 *
 * 复刻 B 站网页端的弹幕元素与动画。视频弹幕使用绝对定位的 `div`，
 * 运动由 CSS 动画（`@keyframes roll`）完成，canvas 的 `shot()` 仅用于截图。
 * 每条弹幕的元素携带 `--fontSize`、`--textShadow` 等变量，
 * 加入 `-show` 类后开始动画。
 *
 * 样式与变量名取自 B 站网页端。
 *
 * ```css
 * position: absolute; line-height: 1.125; white-space: pre;
 * left: var(--offset, -10px); top: var(--top, 0);
 * font-size: var(--fontSize, 25px); color: var(--color, #ffffff);
 * text-shadow: var(--textShadow); opacity: var(--opacity, 1);
 * animation: roll linear var(--duration) forwards;
 * ```
 *
 * 描边由 `getShadow(outlineColor(color), fontBorder)` 生成，
 * 白字（`#ffffff`）配黑色四向 1px 投影。
 * 滚动弹幕的起点、时长与 `--translateX` 由 `./space-manager` 计算。
 */

import type { ReactElement } from 'react';
import { CenterAllocator } from './center';
import { type TextData, Mode } from './decoder';
import { getFontSize, REFERENCE_SIZE } from './font';
import { type BandRect, type ConversationBoxStore, bandRect } from './region';
import type { DanmuSource } from './source';
import {
  type MotionTiming,
  DEFAULT_DURATION,
  DEFAULT_TIMING,
  SpaceManager,
} from './space-manager';
import { type SizeScale, measureSizeScale, textSize } from './text';

/** 本模块用到的最小 React 接口，由模块表满足。 */
export type ReactRuntime = typeof import('react');

/** 会话列表里的一行，这里只取浮层用到的部分。 */
export interface SessionSummaryLike {
  readonly retainedBy?: Readonly<Record<string, number | undefined>>;
}

/** 标准 `useSessions` 钩子从中选取的快照。 */
export interface SessionListLike {
  readonly ids: readonly string[];
  readonly byId: Readonly<Record<string, SessionSummaryLike | undefined>>;
}

/** 面板选中项，按标准 `usePanelInfo` 钩子发布的形状。 */
export interface PanelInfoLike {
  readonly activePanelId: string | null;
}

/**
 * 根作用域槽位入口收到的标准属性。
 * 这两个钩子通常存在，这里标记为可选，宿主改名时槽位入口不会崩溃。
 */
export interface OverlayProps {
  readonly useSessions?: <Selected>(
    selector: (state: SessionListLike) => Selected,
  ) => Selected | undefined;
  readonly usePanelInfo?: <Selected>(
    selector: (info: PanelInfoLike) => Selected,
  ) => Selected | undefined;
}

/**
 * B 站网页端的弹幕面板允许观众调整的项，取值即该面板的默认值。
 */
export interface DanmuOverlayOptions {
  /** 弹幕速度。B 站网页端的滑杆在默认值 1 两侧覆盖 0.4 到 1.6。 */
  readonly speedPlus?: number;
  /** 弹幕字号倍率。B 站网页端的滑杆在默认值 1 两侧覆盖 0.5 到 1.7。 */
  readonly fontSize?: number;
  /** 弹幕自带的 `size` 字段，B 站网页端发 25。 */
  readonly size?: number;
  /** 随屏缩放，让字号跟随层高变化。默认开启。 */
  readonly fullScreenSync?: boolean;
  /** 不透明度。B 站网页端默认 0.8，并把下限钳在 0.1。 */
  readonly opacity?: number;
  /** 显示区域，0 到 100。B 站网页端默认 50。 */
  readonly area?: number;
  /** 字体族，B 站网页端在 Windows 下的出厂值。 */
  readonly fontFamily?: string;
  /** 加粗，B 站网页端默认开启。 */
  readonly bold?: boolean;
  /** 描边类型，0 四向 1px 投影，1 三向 0 0 1px，2 混合。 */
  readonly fontBorder?: number;
  /** 预览活动区域：为活动区域铺底色，供设置页展示边界。默认关闭。 */
  readonly preview?: boolean;
}

const CLASS = 'dsh-danmu-dm';
/** 默认字体族，B 站网页端在 Windows 下的出厂值。 */
const DEFAULT_FAMILY = "SimHei, 'Microsoft JhengHei'";
/** B 站网页端给字体族追加的回落列表。 */
const FAMILY_FALLBACK = ', Arial, Helvetica, sans-serif';
/** 预览活动区域时铺的底色，只用于看清边界。 */
const PREVIEW_FILL = 'rgba(0, 170, 255, 0.1)';
/** 样式表元素上的标记，避免重复注入。 */
const STYLE_MARK = 'data-dsh-danmu-style';
/** 复刻 B 站网页端的样式规则。 */
const DANMU_CSS = `
.${CLASS} {
  position: absolute;
  line-height: 1.125;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  white-space: pre;
  -webkit-perspective: 500px;
  perspective: 500px;
  will-change: transform, opacity, top, left;
  font-weight: bold;
  font-weight: var(--fontWeight, bold);
  font-family: var(--fontFamily);
  font-size: 25px;
  font-size: var(--fontSize, 25px);
  color: #ffffff;
  color: var(--color, #ffffff);
  text-shadow: var(--textShadow);
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
  top: 0;
  top: var(--top, 0);
  opacity: 0;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-align: center;
  -ms-flex-align: center;
  align-items: center;
  left: -10px;
  left: var(--offset, -10px);
  z-index: 200;
  z-index: var(--zIndex, 200);
  display: var(--display, flex);
}
.${CLASS}.${CLASS}-show {
  opacity: 1;
  opacity: var(--opacity, 1);
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
}
.${CLASS}.${CLASS}-show.${CLASS}-roll {
  -webkit-animation: dsh-danmu-roll linear var(--duration) forwards;
  animation: dsh-danmu-roll linear var(--duration) forwards;
}
.${CLASS}.${CLASS}-center {
  top: 0;
  left: 50%;
  -webkit-transform: translate(-50%, 0);
  transform: translate(-50%, 0);
  -webkit-transform: translate(-50%, var(--translateY, 0));
  transform: translate(-50%, var(--translateY, 0));
}
@-webkit-keyframes dsh-danmu-roll {
  0% {
    -webkit-transform: translateX(0) translateZ(0);
    transform: translateX(0) translateZ(0);
  }
  100% {
    -webkit-transform: translateX(var(--translateX)) translateZ(0);
    transform: translateX(var(--translateX)) translateZ(0);
  }
}
@keyframes dsh-danmu-roll {
  0% {
    -webkit-transform: translateX(0) translateZ(0);
    transform: translateX(0) translateZ(0);
  }
  100% {
    -webkit-transform: translateX(var(--translateX)) translateZ(0);
    transform: translateX(var(--translateX)) translateZ(0);
  }
}
`;

function ensureStyles(): void {
  if (
    typeof document === 'undefined' ||
    document.querySelector(`style[${STYLE_MARK}]`) !== null
  ) {
    return;
  }
  const style = document.createElement('style');

  style.setAttribute(STYLE_MARK, '');
  style.textContent = DANMU_CSS;
  document.head.append(style);
}

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

/** 将描边类型归一化为 B 站网页端支持的 0、1、2 三档。 */
function borderOf(border: number): number {
  return border === 1 || border === 2 ? border : 0;
}

/** 构建 `shell.overlay` 的弹幕组件。 */
export function createDanmuOverlay(
  React: ReactRuntime,
  source: DanmuSource,
  region: ConversationBoxStore,
  options: DanmuOverlayOptions = {},
): (props: OverlayProps) => ReactElement {
  const timing: MotionTiming = {
    speedPlus: options.speedPlus ?? DEFAULT_TIMING.speedPlus,
    defaultDuration: DEFAULT_TIMING.defaultDuration,
  };
  const size = options.size ?? REFERENCE_SIZE;
  const fontSize = options.fontSize ?? 1;
  const fullScreenSync = options.fullScreenSync ?? true;
  const area = options.area ?? 50;
  const opacity = options.opacity ?? 0.8;
  const family = options.fontFamily ?? DEFAULT_FAMILY;
  const bold = options.bold ?? true;
  const fontBorder = borderOf(options.fontBorder ?? 0);
  const preview = options.preview ?? false;

  ensureStyles();

  return function DanmuOverlay(props: OverlayProps): ReactElement {
    const useSessions = props.useSessions ?? selectNothing;
    const usePanelInfo = props.usePanelInfo ?? selectNothing;
    const covered = usePanelInfo(info => info.activePanelId !== null) === true;
    const sessionId = useSessions(state =>
      covered ? undefined : currentSessionId(state),
    );
    const hostRef = React.useRef<HTMLDivElement | null>(null);
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const layoutRef = React.useRef<SpaceManager | null>(null);
    const centerRef = React.useRef<CenterAllocator | null>(null);
    const elementsRef = React.useRef(new Set<HTMLDivElement>());
    const timersRef = React.useRef(new Set<number>());
    const scaleRef = React.useRef<{
      readonly key: string;
      readonly scale: SizeScale | null;
    } | null>(null);
    const [layer, setLayer] = React.useState({
      width: 0,
      height: 0,
      left: 0,
      top: 0,
    });

    React.useSyncExternalStore(region.subscribe, region.getSnapshot);

    if (layoutRef.current === null) {
      layoutRef.current = new SpaceManager(timing);
    }

    if (centerRef.current === null) {
      centerRef.current = new CenterAllocator();
    }
    const box = region.read();
    const band: BandRect | null =
      box === null || layer.width === 0 ? null : bandRect(box, layer);

    React.useEffect(() => {
      const node = hostRef.current;

      if (node === null) {
        return undefined;
      }
      const measure = () => {
        const rect = node.getBoundingClientRect();

        setLayer(previous =>
          previous.width === rect.width &&
          previous.height === rect.height &&
          previous.left === rect.left &&
          previous.top === rect.top
            ? previous
            : {
                width: rect.width,
                height: rect.height,
                left: rect.left,
                top: rect.top,
              },
        );
      };
      measure();

      const observer = new ResizeObserver(measure);

      observer.observe(node);

      return () => observer.disconnect();
    }, []);

    const clearRendered = React.useCallback(() => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }
      timersRef.current.clear();

      for (const element of elementsRef.current) {
        element.remove();
      }
      elementsRef.current.clear();
      layoutRef.current = new SpaceManager(timing);
      centerRef.current = new CenterAllocator();
    }, [timing]);

    // 切换会话时，上一会话的弹幕不应继续显示。
    React.useEffect(() => {
      clearRendered();
    }, [sessionId, clearRendered]);
    React.useEffect(() => {
      if (band === null) {
        clearRendered();
      }
    }, [band === null, clearRendered]);
    React.useEffect(() => () => clearRendered(), [clearRendered]);

    /** 字体的宽度基准，按字体族与字重缓存。 */
    const scaleFor = (container: HTMLElement): SizeScale | null => {
      const key = `${family}|${bold}`;

      if (scaleRef.current?.key === key) {
        return scaleRef.current.scale;
      }
      const scale = measureSizeScale(container, family, bold);

      // 测量失败时不写入缓存，待下一帧容器完成布局或字体就绪后重试。
      if (scale !== null) {
        scaleRef.current = { key, scale };
      }
      return scale;
    };
    const push = React.useCallback((textData: TextData) => {
      if (textData.mode !== Mode.Roll && textData.mode !== Mode.Top) {
        return;
      }
      // 布局变化可能移动标记点，但不改变观察者监测的尺寸。
      // 产生弹幕前重新测量可确保读数最新。`refresh` 自带节流，
      // 多数调用不会实际测量。
      region.refresh();

      const container = containerRef.current;
      const spaceManager = layoutRef.current;
      const center = centerRef.current;

      if (container === null || spaceManager === null || center === null) {
        return;
      }
      const containerWidth = container.offsetWidth;
      const containerHeight = container.offsetHeight;

      if (containerWidth <= 0 || containerHeight <= 0) {
        return;
      }
      const now = performance.now() / 1000;
      const fontPx = getFontSize(
        size,
        containerHeight,
        fontSize,
        fullScreenSync,
      );
      const textScale = scaleFor(container);
      const element = document.createElement('div');

      element.className = CLASS;
      element.textContent = textData.text;
      element.style.cssText =
        [
          `--opacity:${Math.max(opacity, 0.1)}`,
          `--fontSize:${fontPx}px`,
          `--fontFamily:${family}${FAMILY_FALLBACK}`,
          `--fontWeight:${bold ? 'bold' : 'normal'}`,
          '--color:#ffffff',
          `--textShadow:${getShadow(0xffffff, fontBorder)}`,
        ].join(';') + ';';
      container.append(element);

      const measured = textSize(textData.text, fontPx, textScale, () => {
        const rect = element.getBoundingClientRect();

        return { width: rect.width, height: rect.height };
      });
      const removeAfter = (node: HTMLDivElement, seconds: number): void => {
        const timer = window.setTimeout(() => {
          node.remove();
          elementsRef.current.delete(node);
          timersRef.current.delete(timer);
        }, seconds * 1000);

        timersRef.current.add(timer);
      };

      if (textData.mode === Mode.Top) {
        const y = center.add({
          height: measured.height,
          now,
          containerHeight,
          area,
        });

        if (y === null) {
          element.remove();

          return;
        }
        elementsRef.current.add(element);
        element.style.cssText += `--translateY:${y}px;`;
        element.classList.add(`${CLASS}-center`, `${CLASS}-show`);
        removeAfter(element, DEFAULT_DURATION);

        return;
      }
      const placement = spaceManager.add({
        width: measured.width,
        height: measured.height,
        now,
        containerWidth,
        containerHeight,
        area,
      });

      if (placement === null) {
        element.remove();

        return;
      }
      elementsRef.current.add(element);
      element.style.cssText +=
        `--offset:${placement.x}px;` +
        `--translateX:${placement.translateX}px;` +
        `--duration:${placement.duration}s;` +
        `--top:${placement.y}px;`;
      element.classList.add(`${CLASS}-roll`, `${CLASS}-show`);
      removeAfter(element, placement.duration);
    }, []);

    React.useEffect(
      () => source.attach(sessionId, push),
      [source, sessionId, push],
    );

    return React.createElement(
      'div',
      {
        ref: hostRef,
        'aria-hidden': true,
        'data-danmu-overlay': '',
        style: {
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        },
      },
      React.createElement(
        'div',
        {
          ref: containerRef,
          'data-danmu-container': '',
          style: {
            position: 'absolute',
            left: band === null ? 0 : `${band.left}px`,
            top: band === null ? 0 : `${band.top}px`,
            width: band === null ? 0 : `${band.width}px`,
            height: band === null ? 0 : `${band.height}px`,
            overflow: 'hidden',
            pointerEvents: 'none',
          },
        },
        preview
          ? React.createElement('div', {
              'data-danmu-preview': '',
              style: {
                position: 'absolute',
                inset: 0,
                background: PREVIEW_FILL,
                pointerEvents: 'none',
              },
            })
          : null,
      ),
    );
  };
}

/**
 * Conversation 正在显示的会话，即主视图持有的会话。
 * 没有可直接使用的钩子，浮层读取宿主界面使用的同一份状态。
 * 全帧面板覆盖时浮层停止显示，该面板移除输入框槽位后标记点消失，
 * 活动区域也随之消失。
 */
function currentSessionId(state: SessionListLike): string | undefined {
  for (const id of state.ids) {
    if ((state.byId[id]?.retainedBy?.mainView ?? 0) > 0) {
      return id;
    }
  }
  return undefined;
}

/** 部署没有提供某个标准属性时的占位实现。 */
function selectNothing<Selected>(
  _selector: (snapshot: never) => Selected,
): undefined {
  return undefined;
}
