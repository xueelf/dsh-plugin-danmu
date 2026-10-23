import { useSyncExternalStore } from 'react';
import type {
  SettingsPanelState,
  SettingsPanelStore,
} from '../stores/settings-panel-store';

/** 订阅设置面板状态。 */
export function useSettingsPanel(
  store: SettingsPanelStore,
): SettingsPanelState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
