import { useSyncExternalStore } from 'react';
import type {
  DanmuSettings,
  DanmuSettingsStore,
} from '../stores/settings-store';

/** 订阅弹幕设置。 */
export function useSettings(store: DanmuSettingsStore): DanmuSettings {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
