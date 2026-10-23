import { expect, test } from 'bun:test';
import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  normaliseSettings,
  SETTINGS_STORAGE_KEY,
  SPEED_STEPS,
} from '#/stores/settings-store';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
test('默认设置', () => {
  const store = createSettingsStore(new MemoryStorage());

  expect(store.getSnapshot()).toEqual(DEFAULT_SETTINGS);
});
test('读取已保存设置', () => {
  const storage = new MemoryStorage();

  storage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({
      speedPlus: 1.3,
      fontSize: 1.2,
      opacity: 0.6,
      area: 30,
    }),
  );
  expect(createSettingsStore(storage).getSnapshot()).toEqual({
    speedPlus: 1.3,
    fontSize: 1.2,
    opacity: 0.6,
    area: 25,
  });
});
test('非法 JSON 回退默认', () => {
  const storage = new MemoryStorage();

  storage.setItem(SETTINGS_STORAGE_KEY, '{');
  expect(createSettingsStore(storage).getSnapshot()).toEqual(DEFAULT_SETTINGS);
});
test('越界值被钳制', () => {
  expect(
    normaliseSettings({
      speedPlus: 99,
      fontSize: 9,
      opacity: 0,
      area: 300,
    }),
  ).toEqual({
    speedPlus: 1,
    fontSize: 1.7,
    opacity: 0.1,
    area: 100,
  });
});
test('速度只接受档位', () => {
  expect(normaliseSettings({ speedPlus: 1.3 }).speedPlus).toBe(1.3);
  expect(normaliseSettings({ speedPlus: 0.75 }).speedPlus).toBe(1);
  expect(SPEED_STEPS).toEqual([0.4, 0.7, 1, 1.3, 1.6]);
});
test('显示区域按 25 步进', () => {
  expect(normaliseSettings({ area: 30 }).area).toBe(25);
  expect(normaliseSettings({ area: 80 }).area).toBe(75);
});
test('不透明度和字号按 1% 步进', () => {
  expect(normaliseSettings({ opacity: 0.805 }).opacity).toBeCloseTo(0.81, 6);
  expect(normaliseSettings({ fontSize: 1.234 }).fontSize).toBeCloseTo(1.23, 6);
});
test('更新持久化并通知', () => {
  const storage = new MemoryStorage();
  const store = createSettingsStore(storage);

  let changes = 0;

  store.subscribe(() => {
    changes += 1;
  });
  store.update({ area: 75 });
  expect(store.getSnapshot().area).toBe(75);
  expect(changes).toBe(1);
  expect(
    JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) ?? '{}'),
  ).toMatchObject({ area: 75 });
});
test('重复更新不通知', () => {
  const store = createSettingsStore(new MemoryStorage());

  let changes = 0;

  store.subscribe(() => {
    changes += 1;
  });
  store.update({ area: 80 });
  store.update({ area: 80 });
  expect(changes).toBe(1);
});
test('重置恢复默认', () => {
  const storage = new MemoryStorage();
  const store = createSettingsStore(storage);

  store.update({ opacity: 0.3, area: 10 });
  store.reset();
  expect(store.getSnapshot()).toEqual(DEFAULT_SETTINGS);
  expect(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toEqual(
    DEFAULT_SETTINGS,
  );
});
test('取消订阅', () => {
  const store = createSettingsStore(new MemoryStorage());

  let changes = 0;

  const unsubscribe = store.subscribe(() => {
    changes += 1;
  });

  unsubscribe();
  store.update({ area: 80 });
  expect(changes).toBe(0);
});
