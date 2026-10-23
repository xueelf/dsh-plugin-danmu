/** 设置面板状态与按钮位置。 */
export interface SettingsPanelState {
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
}

/** 设置面板 store，形状满足 `useSyncExternalStore`。 */
export interface SettingsPanelStore {
  getSnapshot(): SettingsPanelState;
  subscribe(listener: () => void): () => void;
  toggle(anchor?: HTMLElement): void;
  close(): void;
}

/** 创建设置面板 store。 */
export function createSettingsPanelStore(): SettingsPanelStore {
  let state: SettingsPanelState = { open: false, anchor: null };

  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    toggle(anchor) {
      state = state.open
        ? { open: false, anchor: null }
        : { open: true, anchor: anchor ?? state.anchor };

      for (const listener of listeners) {
        listener();
      }
    },
    close() {
      if (!state.open) {
        return;
      }
      state = { open: false, anchor: null };

      for (const listener of listeners) {
        listener();
      }
    },
  };
}
