/**
 * `dsh-plugin-danmu` 的 Client 入口。
 *
 * 本文件按裸浏览器脚本加载，不得出现 `import` 与 `export` 语句。
 * React 及共享 Harness 模块通过 `require` 从浏览器模块表取得。
 * 构建时包名保持 external，避免内联第二份 React。
 */

import {
  type ReactRuntime,
  createDanmuOverlay,
  ensureDanmuStyles,
} from './danmu/overlay';
import { createRegionProbe } from './danmu/probe';
import { ConversationBoxStore } from './danmu/region';
import { createSettingsStore } from './danmu/settings';
import {
  createOpenStore,
  createSettingsButton,
  createSettingsPanel,
  ensureSettingsStyles,
  SETTINGS_LOCALE,
  SETTINGS_NS,
} from './danmu/settings-ui';
import { type SourceContext, createSessionSource } from './danmu/source';

const PACKAGE_NAME = 'dsh-plugin-danmu';
/**
 * 覆盖整帧的浮层，位于所有栏之上与滚动容器之外，
 * 默认点击穿透，入口可自行接管指针事件。
 * 弹幕仅绘制在测量出的内容区内，负 order 将浮层置于层内既有提示之下。
 */
const OVERLAY_SLOT = 'shell.overlay';
const OVERLAY_ORDER = -1;
/**
 * 两个由 Conversation 布局的 additive 列表槽位，
 * 每个槽位放置一个零高度标记点供区域存储测量。
 * Client API 不公开面板几何，宿主类名由构建生成。
 * 该方式用于取得内容区矩形。
 *
 * - `.utilities` 位于头部首行，标记点横跨该行，其下边缘为内容区上边界。
 * - `conversation.input.dock` 在输入框上方满宽布局，标记点给出栏的横向范围。
 *
 * 内容区的下边界取头部标记点所在栏的下边缘，
 * 输入框在栏内增高不会改变该边界。
 */
const CONTENT_TOP_SLOT = 'conversation.session.header.utilities';
const CONTENT_BOTTOM_SLOT = 'conversation.input.dock';
/** 输入框左下角的弹幕设置按钮。 */
const SETTINGS_BUTTON_SLOT = 'conversation.input.left';
/** 全帧浮层，设置面板按按钮位置固定定位。 */
const SETTINGS_PANEL_SLOT = 'shell.overlay';

type ModuleRequire = (id: string) => unknown;

/**
 * 校验加载器返回的对象符合浮层使用的 React 接口。
 *
 * `require` 的返回值声明为 unknown，不假定模块表返回的内容。
 * 本 bundle 用到的每个成员均在此处校验。
 */
function isReactRuntime(value: unknown): value is ReactRuntime {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    'createElement' in value &&
    typeof value.createElement === 'function' &&
    'useState' in value &&
    typeof value.useState === 'function' &&
    'useRef' in value &&
    typeof value.useRef === 'function' &&
    'useEffect' in value &&
    typeof value.useEffect === 'function' &&
    'useCallback' in value &&
    typeof value.useCallback === 'function' &&
    'useSyncExternalStore' in value &&
    typeof value.useSyncExternalStore === 'function'
  );
}

interface ClientPlugin {
  inject: string[];
  apply(ctx: ClientContext): void;
}

/** 插件 Client 上下文切片。 */
interface ClientLocale {
  register(
    ns: string,
    locale: string,
    dict: Record<string, string>,
  ): () => void;
  bind(ns: string): (key: string) => string;
}

interface ClientContext extends SourceContext {
  effect(callback: () => () => void, label?: string): () => void;
  locale: ClientLocale;
  slots: {
    inject(key: string, callback: () => () => void): () => void;
    register(
      options: { name: string; id: string; order?: number },
      component: unknown,
    ): () => void;
  };
}

const moduleLoader = window.__ModuleLoader__;

if (moduleLoader === undefined) {
  throw new Error(`${PACKAGE_NAME}: the Web module loader is unavailable`);
}
const definition: ModuleLoaderDefinition = {
  id: PACKAGE_NAME,
  factory(require: ModuleRequire): ClientPlugin {
    const React = require('react');

    if (!isReactRuntime(React)) {
      throw new Error(
        `${PACKAGE_NAME}: the module loader did not provide react`,
      );
    }
    return {
      inject: ['slots', 'sessions', 'locale'],
      apply(ctx) {
        const region = new ConversationBoxStore();
        const settings = createSettingsStore();
        const open = createOpenStore();

        ctx.effect(() => {
          const zh = ctx.locale.register(SETTINGS_NS, 'zh', SETTINGS_LOCALE.zh);
          const en = ctx.locale.register(SETTINGS_NS, 'en', SETTINGS_LOCALE.en);

          return () => {
            zh();
            en();
          };
        }, 'danmu: locale');
        ctx.effect(() => {
          document.querySelector('style[data-dsh-danmu-style]')?.remove();
          document
            .querySelector('style[data-dsh-danmu-settings-style]')
            ?.remove();
          ensureDanmuStyles();
          ensureSettingsStyles();

          return () => {
            document.querySelector('style[data-dsh-danmu-style]')?.remove();
            document
              .querySelector('style[data-dsh-danmu-settings-style]')
              ?.remove();
          };
        }, 'danmu: styles');

        const t = ctx.locale.bind(SETTINGS_NS);
        const Overlay = createDanmuOverlay(
          React,
          createSessionSource(ctx),
          region,
          settings,
        );
        const SettingsButton = createSettingsButton(React, open, t);
        const SettingsPanel = createSettingsPanel(React, settings, open, t);
        const ContentTopProbe = createRegionProbe(React, region, 'content-top');
        const ContentBottomProbe = createRegionProbe(
          React,
          region,
          'content-bottom',
        );
        const register = (
          slot: string,
          id: string,
          component: unknown,
          order?: number,
        ): (() => void) =>
          ctx.effect(
            () =>
              ctx.slots.inject(slot, () =>
                ctx.slots.register({ name: slot, id, order }, component),
              ),
            `danmu: ${slot}`,
          );

        register(
          CONTENT_TOP_SLOT,
          `${PACKAGE_NAME}/content-top`,
          ContentTopProbe,
        );
        register(
          CONTENT_BOTTOM_SLOT,
          `${PACKAGE_NAME}/content-bottom`,
          ContentBottomProbe,
        );
        register(
          SETTINGS_BUTTON_SLOT,
          `${PACKAGE_NAME}/settings-button`,
          SettingsButton,
          10,
        );
        register(
          SETTINGS_PANEL_SLOT,
          `${PACKAGE_NAME}/settings-panel`,
          SettingsPanel,
          10,
        );
        register(OVERLAY_SLOT, PACKAGE_NAME, Overlay, OVERLAY_ORDER);
      },
    };
  },
};

moduleLoader.load(definition);
