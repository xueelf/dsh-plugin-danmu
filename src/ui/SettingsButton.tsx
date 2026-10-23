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
        <span className="dsh-danmu-settings-glyph" aria-hidden="true">
          弹
        </span>
      </button>
    );
  };
}
