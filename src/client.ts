/**
 * `dsh-plugin-danmu` 的 Client 入口。
 *
 * 源码是普通 TS 模块，构建为 CJS 后由 `__ModuleLoader__.load` 的 factory 包裹。
 * React 和 `react/jsx-runtime` 由页面模块表通过 factory 的 `require` 提供。
 */

import { type SourceContext, createSessionSource } from './conversation/source';
import { ConversationBoxStore } from './danmu/region';
import { SETTINGS_LOCALE } from './locales';
import { createSettingsPanelStore } from './stores/settings-panel-store';
import { createSettingsStore } from './stores/settings-store';
import { injectStyles, removeStyles } from './styles/inject';
import { createDanmuOverlay } from './ui/DanmuOverlay';
import { createRegionProbe } from './ui/RegionProbe';
import { createSettingsButton } from './ui/SettingsButton';
import { createSettingsPanel } from './ui/SettingsPanel';

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

/** 插件 Client 上下文切片。 */
interface ClientLocale {
  register(
    ns: string,
    messages: {
      readonly en: Record<string, string>;
      readonly zh: Record<string, string>;
    },
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

export const inject = ['slots', 'sessions', 'locale'];

export function apply(ctx: ClientContext): void {
  const region = new ConversationBoxStore();
  const settings = createSettingsStore();
  const open = createSettingsPanelStore();

  ctx.effect(
    () => ctx.locale.register(__PACKAGE_NAME__, SETTINGS_LOCALE),
    'danmu: locale',
  );
  ctx.effect(() => {
    removeStyles();
    injectStyles();

    return removeStyles;
  }, 'danmu: styles');

  const t = ctx.locale.bind(__PACKAGE_NAME__);
  const Overlay = createDanmuOverlay(
    createSessionSource(ctx),
    region,
    settings,
  );
  const SettingsButton = createSettingsButton(open, t);
  const SettingsPanel = createSettingsPanel(settings, open, t);
  const ContentTopProbe = createRegionProbe(region, 'content-top');
  const ContentBottomProbe = createRegionProbe(region, 'content-bottom');
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
    `${__PACKAGE_NAME__}/content-top`,
    ContentTopProbe,
  );
  register(
    CONTENT_BOTTOM_SLOT,
    `${__PACKAGE_NAME__}/content-bottom`,
    ContentBottomProbe,
  );
  register(
    SETTINGS_BUTTON_SLOT,
    `${__PACKAGE_NAME__}/settings-button`,
    SettingsButton,
    10,
  );
  register(
    OVERLAY_SLOT,
    `${__PACKAGE_NAME__}/settings-panel`,
    SettingsPanel,
    10,
  );
  register(OVERLAY_SLOT, __PACKAGE_NAME__, Overlay, OVERLAY_ORDER);
}
