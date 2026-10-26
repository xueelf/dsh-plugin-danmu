import type { ReactElement } from 'react';
import { useSettingsPanel } from '../hooks/use-settings-panel';
import type { Translate } from '../locales';
import type { SettingsPanelStore } from '../stores/settings-panel-store';

/** 输入框工具行里的弹幕设置按钮。 */
export function createSettingsButton(
  open: SettingsPanelStore,
  t: Translate,
): () => ReactElement {
  return function DanmuSettingsButton(): ReactElement {
    const state = useSettingsPanel(open);

    return (
      <button
        type="button"
        className="dsh-danmu-settings-button"
        data-danmu-settings-button=""
        aria-label={t('open')}
        aria-haspopup="dialog"
        aria-expanded={state.open}
        onClick={event => open.toggle(event.currentTarget)}
      >
        {/*
          插件自绘，图形范围 13×13，显示 14px 与官方权限图标一致，
          stroke-width 1（viewBox 16），不复用 primitives。
        */}
        <svg
          className="dsh-danmu-settings-icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3.5 1.5h9A2 2 0 0 1 14.5 3.5v7.5a2 2 0 0 1-2 2H7L4.5 14.5V13H3.5a2 2 0 0 1-2-2V3.5a2 2 0 0 1 2-2Z" />
          <path d="M4.5 5.5h7M4.5 8.5h4.5" />
        </svg>
        <span className="dsh-danmu-settings-glyph" aria-hidden="true">
          弹幕
        </span>
      </button>
    );
  };
}
