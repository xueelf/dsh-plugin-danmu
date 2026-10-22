/**
 * 弹幕设置面板的按钮与浮层。
 *
 * 按钮注册在 `conversation.input.left`，浮层注册在 `shell.overlay`。
 * 浮层用 `position: fixed` 定位到按钮上沿，避免输入框内的其他菜单
 * 移动浮层容器时把设置面板一起带走。
 *
 * 外观对齐宿主自己的悬浮菜单：
 * 背景 `--dsw-specific-menu`、`--dsw-menu-backdrop-filter`、
 * `--dsw-elevation-prominent` 阴影、无边框、`--dsw-radius-lg`、12px 字号。
 *
 * 面板结构与 B 站原始 DOM 一致：
 * 行标题、进度区在同一行，进度区里包含进度条和数值。
 * 行高 16px、下边距 16px、标题列 61px、数值 60px 且 padding-left 20px。
 * 显示区域与弹幕速度各有五个档位，不透明度与弹幕字号没有刻度。
 * 面板宽度 320px、内边距 12px 20px，均取自 B 站 CSS。
 *
 * 几何来源：
 * 面板与行取自 npd.505 的 .bpx-player-dm-setting-left-*。
 * 进度条、圆点、刻度与数值取自 npd.586 的 .bui-progress-*。
 * 恢复默认按钮取自 npd.586 的 .bui-button .bui-area。
 * 宿主全局 corner-shape 是 superellipse，正圆元素必须显式 corner-shape: round。
 *
 * 颜色不复刻 B 站深色面板，改用 DSH 主题色。
 */

import type {
  ReactElement,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type { ReactRuntime } from './overlay';
import { type DanmuSettingsStore, SPEED_STEPS } from './settings';

/** Client locale 命名空间。 */
export const SETTINGS_NS = 'dsh-plugin-danmu';

/** 翻译函数，只需按键取文案。 */
export type Translate = (key: string) => string;

/** 面板状态与按钮位置。 */
export interface SettingsOpenState {
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
}

/** 面板开关，形状满足 `useSyncExternalStore`。 */
export interface SettingsOpenStore {
  getSnapshot(): SettingsOpenState;
  subscribe(listener: () => void): () => void;
  toggle(anchor?: HTMLElement): void;
  close(): void;
}

/** 面板的本地化文案。 */
export const SETTINGS_LOCALE: Record<'en' | 'zh', Record<string, string>> = {
  en: {
    open: 'Danmu settings',
    displayArea: 'Display area',
    opacity: 'Opacity',
    fontSize: 'Font size',
    speed: 'Speed',
    speedExtremelySlow: 'Very slow',
    speedSlower: 'Slow',
    speedModerate: 'Medium',
    speedFaster: 'Fast',
    speedExtremelyFast: 'Very fast',
    reset: 'Restore default settings',
  },
  zh: {
    open: '弹幕设置',
    displayArea: '显示区域',
    opacity: '不透明度',
    fontSize: '弹幕字号',
    speed: '弹幕速度',
    speedExtremelySlow: '极慢',
    speedSlower: '较慢',
    speedModerate: '适中',
    speedFaster: '较快',
    speedExtremelyFast: '极快',
    reset: '恢复默认设置',
  },
};

const SPEED_LABEL_KEYS = [
  'speedExtremelySlow',
  'speedSlower',
  'speedModerate',
  'speedFaster',
  'speedExtremelyFast',
] as const;
/** B 站显示区域与弹幕速度的五个档位。 */
const FIVE_STOP_TICKS = [0, 25, 50, 75, 100] as const;
const STYLE_MARK = 'data-dsh-danmu-settings-style';
const SETTINGS_CSS = `
.dsh-danmu-settings-button {
  appearance: none;
  border-radius: var(--dsw-radius-sm);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  background: 0 0;
  border: 0;
  outline: none;
  align-items: center;
  justify-content: center;
  padding: 7px;
  display: inline-flex;
  position: relative;
}
.dsh-danmu-settings-button:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-danmu-settings-glyph {
  font-size: 13px;
  font-weight: 500;
  line-height: 14px;
}
.dsh-danmu-settings-panel {
  --dsh-danmu-accent: var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--dsw-alias-state-business-primary));
  position: fixed;
  box-sizing: border-box;
  width: 320px;
  max-width: min(320px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  z-index: 1100;
  pointer-events: auto;
  padding: 12px 20px;
  border: 0;
  outline: none;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-specific-menu);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 12px;
  line-height: 20px;
}
.dsh-danmu-settings-row {
  display: flex;
  align-items: center;
  width: 100%;
  height: 16px;
  margin-bottom: 16px;
}
.dsh-danmu-settings-label {
  flex: 0 1 61px;
  min-width: 0;
  width: 61px;
  height: 16px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 16px;
  text-align: left;
  white-space: nowrap;
}
.dsh-danmu-settings-area {
  display: flex;
  align-items: center;
  flex: 1 1 100%;
  min-width: 0;
  height: 16px;
  margin-left: 10px;
}
.dsh-danmu-settings-value {
  /* B 站数值列固定 60 基宽并允许收缩，四条轨道等长。 */
  flex: 0 1 60px;
  min-width: 0;
  box-sizing: border-box;
  width: 60px;
  height: 16px;
  padding-left: 20px;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  text-align: left;
}
.dsh-danmu-settings-track {
  position: relative;
  /* B 站 .bui-progress-wrap 是 width:100%，和数值列一起收缩。 */
  flex: 1 1 100%;
  min-width: 0;
  height: 12px;
  cursor: pointer;
  touch-action: none;
  outline: none;
}
.dsh-danmu-settings-track::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 6px;
  border-radius: 6px;
  background: var(--dsw-alias-border-l3);
  transform: translateY(-50%);
}
.dsh-danmu-settings-track:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid
    var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: 2px;
  border-radius: 6px;
}
.dsh-danmu-settings-bar {
  position: absolute;
  left: 0;
  top: 50%;
  height: 6px;
  border-radius: 6px;
  background: var(--dsh-danmu-accent);
  transform: translateY(-50%);
}
.dsh-danmu-settings-dot {
  position: absolute;
  right: 0;
  top: 50%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary-foreground);
  box-shadow: 0 1px 3px
    color-mix(in srgb, var(--dsw-alias-label-primary) 30%, transparent);
  transform: translate(6px, -50%);
}
.dsh-danmu-settings-steps {
  position: absolute;
  left: 6px;
  right: 6px;
  top: 50%;
  height: 0;
}
.dsh-danmu-settings-step {
  position: absolute;
  top: 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary-foreground);
  transform: translateY(-50%);
}
.dsh-danmu-settings-dot,
.dsh-danmu-settings-step {
  /* 宿主全局 corner-shape 是 superellipse，正圆必须显式 round。 */
  corner-shape: round;
}
.dsh-danmu-settings-reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 116px;
  height: 22px;
  margin-top: 9px;
  padding: 0 3px;
  border: 1px solid var(--dsw-alias-border-l4);
  border-radius: 2px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  cursor: pointer;
}
.dsh-danmu-settings-reset:hover {
  border-color: var(--dsh-danmu-accent);
  color: var(--dsh-danmu-accent);
}
.dsh-danmu-settings-reset:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid
    var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: -1px;
}
`;

export function ensureSettingsStyles(): void {
  if (
    typeof document === 'undefined' ||
    document.querySelector(`style[${STYLE_MARK}]`) !== null
  ) {
    return;
  }
  const style = document.createElement('style');

  style.setAttribute(STYLE_MARK, '');
  style.textContent = SETTINGS_CSS;
  document.head.append(style);
}

/** 创建一个面板开关。 */
export function createOpenStore(initial = false): SettingsOpenStore {
  let state: SettingsOpenState = { open: initial, anchor: null };

  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    toggle(anchor) {
      state = state.open
        ? { open: false, anchor: null }
        : { open: true, anchor: anchor ?? state.anchor };

      for (const listener of listeners) {
        listener();
      }
    },
    close() {
      if (!state.open) {
        return;
      }
      state = { open: false, anchor: null };

      for (const listener of listeners) {
        listener();
      }
    },
  };
}

/** 输入框工具行里的弹幕设置按钮。 */
export function createSettingsButton(
  React: ReactRuntime,
  open: SettingsOpenStore,
  t: Translate,
): () => ReactElement {
  return function DanmuSettingsButton(): ReactElement {
    const state = React.useSyncExternalStore(open.subscribe, open.getSnapshot);

    return React.createElement(
      'button',
      {
        type: 'button',
        className: 'dsh-danmu-settings-button',
        'data-danmu-settings-button': '',
        'aria-label': t('open'),
        'aria-haspopup': 'dialog',
        'aria-expanded': state.open,
        onClick: (event: ReactMouseEvent<HTMLButtonElement>) =>
          open.toggle(event.currentTarget),
      },
      React.createElement(
        'span',
        { className: 'dsh-danmu-settings-glyph', 'aria-hidden': true },
        '弹',
      ),
    );
  };
}

function speedIndex(speedPlus: number): number {
  for (let index = 0; index < SPEED_STEPS.length; index += 1) {
    if (SPEED_STEPS[index] === speedPlus) {
      return index;
    }
  }
  return 2;
}

/** 输入框上方的弹幕设置浮层。 */
export function createSettingsPanel(
  React: ReactRuntime,
  store: DanmuSettingsStore,
  open: SettingsOpenStore,
  t: Translate,
): () => ReactElement | null {
  interface SliderProps {
    readonly label: string;
    readonly format: (value: number) => string;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly current: number;
    readonly ticks?: readonly number[];
    readonly onChange: (value: number) => void;
  }

  function Slider(props: SliderProps): ReactElement {
    const trackRef = React.useRef<HTMLDivElement | null>(null);
    const draggingRef = React.useRef(false);
    const draftRef = React.useRef<number | null>(null);
    const [draft, setDraft] = React.useState<number | null>(null);
    const displayValue = draft ?? props.current;

    React.useEffect(() => {
      if (draftRef.current !== null && props.current === draftRef.current) {
        draftRef.current = null;
        setDraft(null);
      }
    }, [props.current]);

    const percent =
      props.max === props.min
        ? 0
        : Math.round(
            ((displayValue - props.min) / (props.max - props.min)) * 100,
          );
    const setFromClientX = (clientX: number): void => {
      const track = trackRef.current;

      if (track === null) {
        return;
      }
      const rect = track.getBoundingClientRect();

      if (rect.width <= 0) {
        return;
      }
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      const raw = props.min + ratio * (props.max - props.min);
      const next = Math.max(
        props.min,
        Math.min(props.max, Math.round(raw / props.step) * props.step),
      );

      if (next !== draftRef.current) {
        draftRef.current = next;
        setDraft(next);
      }
    };
    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
      event.preventDefault();
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setFromClientX(event.clientX);
    };
    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (draggingRef.current) {
        setFromClientX(event.clientX);
      }
    };
    const release = (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    };
    const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      release(event);

      const next = draftRef.current;

      if (next === null) {
        return;
      }

      if (next === props.current) {
        draftRef.current = null;
        setDraft(null);

        return;
      }
      props.onChange(next);
    };
    const onPointerCancel = (
      event: ReactPointerEvent<HTMLDivElement>,
    ): void => {
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      release(event);
      draftRef.current = null;
      setDraft(null);
    };
    const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      let next: number | null = null;

      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        next = props.current - props.step;
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        next = props.current + props.step;
      }

      if (next === null) {
        return;
      }
      event.preventDefault();
      props.onChange(Math.max(props.min, Math.min(props.max, next)));
    };
    return React.createElement(
      'div',
      { className: 'dsh-danmu-settings-row' },
      React.createElement(
        'span',
        { className: 'dsh-danmu-settings-label' },
        props.label,
      ),
      React.createElement(
        'div',
        { className: 'dsh-danmu-settings-area' },
        React.createElement(
          'div',
          {
            ref: trackRef,
            className: 'dsh-danmu-settings-track',
            role: 'slider',
            tabIndex: 0,
            'aria-label': props.label,
            'aria-valuemin': props.min,
            'aria-valuemax': props.max,
            'aria-valuenow': displayValue,
            'aria-valuetext': props.format(displayValue),
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel,
            onLostPointerCapture: onPointerCancel,
            onKeyDown,
          },
          React.createElement(
            'div',
            {
              className: 'dsh-danmu-settings-bar',
              style: { width: `${percent}%` },
            },
            React.createElement('span', {
              className: 'dsh-danmu-settings-dot',
            }),
          ),
          props.ticks === undefined
            ? null
            : React.createElement(
                'div',
                { className: 'dsh-danmu-settings-steps', 'aria-hidden': true },
                props.ticks.map(tick =>
                  React.createElement('span', {
                    key: tick,
                    className: 'dsh-danmu-settings-step',
                    style: {
                      left: `${tick}%`,
                      marginLeft:
                        tick === 0 ? '-4px' : tick === 100 ? '0' : '-1px',
                    },
                  }),
                ),
              ),
        ),
        React.createElement(
          'span',
          { className: 'dsh-danmu-settings-value' },
          props.format(displayValue),
        ),
      ),
    );
  }

  return function DanmuSettingsPanel(): ReactElement | null {
    const state = React.useSyncExternalStore(open.subscribe, open.getSnapshot);
    const settings = React.useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
    );
    const panelRef = React.useRef<HTMLDivElement | null>(null);
    const restoreFocusRef = React.useRef(false);
    const [, setTick] = React.useState(0);

    React.useEffect(() => {
      if (!state.open) {
        return undefined;
      }
      const onResize = (): void => {
        setTick(tick => tick + 1);
      };
      window.addEventListener('resize', onResize);

      return () => window.removeEventListener('resize', onResize);
    }, [state.open]);
    React.useEffect(() => {
      if (!state.open) {
        return undefined;
      }
      const panel = panelRef.current;
      const anchor = state.anchor;

      restoreFocusRef.current = false;
      panel?.focus();

      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
          restoreFocusRef.current = true;
          open.close();
        }
      };
      const onPointerDown = (event: PointerEvent): void => {
        const target = event.target;

        if (!(target instanceof Element)) {
          return;
        }

        if (target.closest('[data-danmu-settings-panel]') !== null) {
          return;
        }

        if (target.closest('[data-danmu-settings-button]') !== null) {
          return;
        }
        restoreFocusRef.current = false;
        open.close();
      };
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('pointerdown', onPointerDown, true);

      return () => {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('pointerdown', onPointerDown, true);

        if (restoreFocusRef.current && anchor?.isConnected === true) {
          anchor.focus();
        }
      };
    }, [state.open, state.anchor, open]);

    if (!state.open) {
      return null;
    }
    const anchor = state.anchor;
    const rect =
      anchor?.isConnected === true ? anchor.getBoundingClientRect() : null;
    const left =
      rect === null
        ? 12
        : Math.max(12, Math.min(rect.left, window.innerWidth - 332));
    const bottom =
      rect === null ? 12 : Math.max(12, window.innerHeight - rect.top + 8);
    const maxHeight =
      rect === null ? 'calc(100vh - 24px)' : `${Math.max(0, rect.top - 20)}px`;
    const index = speedIndex(settings.speedPlus);

    return React.createElement(
      'div',
      {
        ref: panelRef,
        className: 'dsh-danmu-settings-panel',
        'data-danmu-settings-panel': '',
        role: 'dialog',
        'aria-label': t('open'),
        tabIndex: -1,
        style: {
          left: `${left}px`,
          bottom: `${bottom}px`,
          maxHeight,
        },
      },
      React.createElement(Slider, {
        label: t('displayArea'),
        format: value => `${Math.round(value)}%`,
        min: 0,
        max: 100,
        step: 25,
        current: settings.area,
        ticks: FIVE_STOP_TICKS,
        onChange: value => store.update({ area: value }),
      }),
      React.createElement(Slider, {
        label: t('opacity'),
        format: value => `${Math.round(value)}%`,
        min: 10,
        max: 100,
        step: 1,
        current: Math.round(settings.opacity * 100),
        onChange: value => store.update({ opacity: value / 100 }),
      }),
      React.createElement(Slider, {
        label: t('fontSize'),
        format: value => `${Math.round(value)}%`,
        min: 50,
        max: 170,
        step: 1,
        current: Math.round(settings.fontSize * 100),
        onChange: value => store.update({ fontSize: value / 100 }),
      }),
      React.createElement(Slider, {
        label: t('speed'),
        format: value => t(SPEED_LABEL_KEYS[value] ?? SPEED_LABEL_KEYS[2]),
        min: 0,
        max: 4,
        step: 1,
        current: index,
        ticks: FIVE_STOP_TICKS,
        onChange: value => {
          const next = SPEED_STEPS[value];

          if (next !== undefined) {
            store.update({ speedPlus: next });
          }
        },
      }),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-danmu-settings-reset',
          onClick: () => store.reset(),
        },
        t('reset'),
      ),
    );
  };
}
