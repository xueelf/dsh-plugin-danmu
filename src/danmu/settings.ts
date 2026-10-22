/**
 * 弹幕设置：B 站网页端弹幕面板里可调的四项。
 *
 * 默认值与取值范围取自 B 站播放器配置：
 * - `speedPlus` 默认 1，滑杆档位 `[0.4, 0.7, 1, 1.3, 1.6]`（`dmSetting` 的 `dmSpeedplus`）
 * - `fontSize` 默认 1，范围 0.5 到 1.7（`dmSetting` 的 `dmFontsize`）
 * - `opacity` 默认 0.8，渲染时下限钳到 0.1（`dmSetting.opacity`）
 * - `area` 默认 50，范围 0 到 100（`dmSetting.dmarea`）
 *
 * 档位文案取自 B 站播放器 i18n：极慢、较慢、适中、较快、极快。
 */

/** 弹幕面板可调的四项。 */
export interface DanmuSettings {
  readonly speedPlus: number;
  readonly fontSize: number;
  readonly opacity: number;
  readonly area: number;
}

/** B 站速度滑杆的五个档位。 */
export const SPEED_STEPS = [0.4, 0.7, 1, 1.3, 1.6] as const;

/** B 站弹幕面板的出厂值。 */
export const DEFAULT_SETTINGS: DanmuSettings = {
  speedPlus: 1,
  fontSize: 1,
  opacity: 0.8,
  area: 50,
};

/** 设置保存在本机浏览器里，不进入 profile 或会话记录。 */
export const SETTINGS_STORAGE_KEY = 'dsh-plugin-danmu:settings';

/** 只用到读取和写入的存储接口，便于测试替换。 */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 设置存储，形状满足 `useSyncExternalStore`。 */
export interface DanmuSettingsStore {
  getSnapshot(): DanmuSettings;
  subscribe(listener: () => void): () => void;
  update(patch: Partial<DanmuSettings>): void;
  reset(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 字号和不透明度按 1% 步进，与面板滑杆一致。 */
function snapHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 速度只接受滑杆上的精确档位，其他值回退到默认档。 */
function normaliseSpeed(value: number | null): number {
  if (value === null) {
    return DEFAULT_SETTINGS.speedPlus;
  }

  for (const step of SPEED_STEPS) {
    if (Math.abs(step - value) < 1e-9) {
      return step;
    }
  }
  return DEFAULT_SETTINGS.speedPlus;
}

/** 显示区域按 25% 步进，对应 B 站面板的四个档位。 */
function normaliseArea(value: number | null): number {
  return Math.round(clamp(value ?? DEFAULT_SETTINGS.area, 0, 100) / 25) * 25;
}

/** 把任意输入收窄成合法的设置，并把越界值钳到范围内。 */
export function normaliseSettings(value: unknown): DanmuSettings {
  const record = isRecord(value) ? value : {};

  return {
    speedPlus: normaliseSpeed(readNumber(record.speedPlus)),
    fontSize: snapHundredth(
      clamp(readNumber(record.fontSize) ?? DEFAULT_SETTINGS.fontSize, 0.5, 1.7),
    ),
    opacity: snapHundredth(
      clamp(readNumber(record.opacity) ?? DEFAULT_SETTINGS.opacity, 0.1, 1),
    ),
    area: normaliseArea(readNumber(record.area)),
  };
}

function loadSettings(storage: SettingsStorage | null): DanmuSettings {
  if (storage === null) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);

    return raw === null
      ? { ...DEFAULT_SETTINGS }
      : normaliseSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(
  storage: SettingsStorage | null,
  settings: DanmuSettings,
): void {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 隐私模式或配额不足时保留内存中的设置即可。
  }
}

function resolveStorage(): SettingsStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 创建设置存储，默认读写本机 `localStorage`。 */
export function createSettingsStore(
  storage: SettingsStorage | null = resolveStorage(),
): DanmuSettingsStore {
  let current = loadSettings(storage);

  const listeners = new Set<() => void>();
  const commit = (next: DanmuSettings): void => {
    if (
      current.speedPlus === next.speedPlus &&
      current.fontSize === next.fontSize &&
      current.opacity === next.opacity &&
      current.area === next.area
    ) {
      return;
    }
    current = next;
    saveSettings(storage, next);

    for (const listener of listeners) {
      listener();
    }
  };
  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    update(patch) {
      commit(normaliseSettings({ ...current, ...patch }));
    },
    reset() {
      commit({ ...DEFAULT_SETTINGS });
    },
  };
}
