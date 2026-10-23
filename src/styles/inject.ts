/**
 * 插件注入到宿主页面的样式表。
 *
 * CSS 由 Bun 的 text loader 内联成字符串。
 * 两个 style 标签都由 Client 的同一个 ctx.effect 创建和移除。
 */

import danmuCss from './danmu.css';
import settingsCss from './settings.css';

const DANMU_STYLE_MARK = 'data-dsh-danmu-style';
const SETTINGS_STYLE_MARK = 'data-dsh-danmu-settings-style';

function ensureStyle(mark: string, css: string): void {
  if (document.querySelector(`style[${mark}]`) !== null) {
    return;
  }
  const style = document.createElement('style');

  style.setAttribute(mark, '');
  style.textContent = css;
  document.head.append(style);
}

function removeStyle(mark: string): void {
  document.querySelector(`style[${mark}]`)?.remove();
}

/** 注入弹幕和设置面板样式。 */
export function ensureStyles(): void {
  ensureStyle(DANMU_STYLE_MARK, danmuCss);
  ensureStyle(SETTINGS_STYLE_MARK, settingsCss);
}

/** 移除弹幕和设置面板样式。 */
export function removeStyles(): void {
  removeStyle(DANMU_STYLE_MARK);
  removeStyle(SETTINGS_STYLE_MARK);
}
