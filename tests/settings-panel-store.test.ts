import { expect, test } from 'bun:test';
import {
  type SettingsPanelState,
  createSettingsPanelStore,
} from '#/stores/settings-panel-store';

test('设置面板 store 开关与订阅', () => {
  const store = createSettingsPanelStore();
  const snapshots: SettingsPanelState[] = [];
  const unsubscribe = store.subscribe(() => {
    snapshots.push(store.getSnapshot());
  });

  expect(store.getSnapshot()).toEqual({ open: false, anchor: null });
  store.toggle();
  expect(store.getSnapshot()).toEqual({ open: true, anchor: null });
  store.close();
  expect(store.getSnapshot()).toEqual({ open: false, anchor: null });
  store.close();
  expect(snapshots).toHaveLength(2);
  unsubscribe();
  store.toggle();
  expect(snapshots).toHaveLength(2);
  expect(store.getSnapshot().open).toBe(true);
});
