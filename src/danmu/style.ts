/**
 * 插件注入到宿主页面的样式表。
 *
 * 两个 style 标签都由 Client 的同一个 ctx.effect 创建和移除。
 * overlay 与设置面板只提供自己的 CSS 文本，不再各自操作 document.head。
 */

export const DANMU_STYLE_MARK = 'data-dsh-danmu-style';
export const SETTINGS_STYLE_MARK = 'data-dsh-danmu-settings-style';

/** 创建带标记的 style 标签，已存在时保持原样。 */
export function ensureStyle(mark: string, css: string): void {
  if (
    typeof document === 'undefined' ||
    document.querySelector(`style[${mark}]`) !== null
  ) {
    return;
  }
  const style = document.createElement('style');

  style.setAttribute(mark, '');
  style.textContent = css;
  document.head.append(style);
}

/** 移除带标记的 style 标签。 */
export function removeStyle(mark: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.querySelector(`style[${mark}]`)?.remove();
}
