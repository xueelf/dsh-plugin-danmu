import {
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { TextData } from '../conversation/decoder';
import type { DanmuSource } from '../conversation/source';
import { DanmuOverlayEngine } from '../danmu/overlay';
import {
  type BandRect,
  type ConversationBoxStore,
  bandRect,
} from '../danmu/region';
import { useSettings } from '../hooks/use-settings';
import type { DanmuSettingsStore } from '../stores/settings-store';

/** 会话列表里的一行，这里只取浮层用到的部分。 */
export interface SessionSummaryLike {
  readonly retainedBy?: Readonly<Record<string, number | undefined>>;
}

/** 标准 `useSessions` 钩子从中选取的快照。 */
export interface SessionListLike {
  readonly ids: readonly string[];
  readonly byId: Readonly<Record<string, SessionSummaryLike | undefined>>;
}

/** 面板选中项，按标准 `usePanelInfo` 钩子发布的形状。 */
export interface PanelInfoLike {
  readonly activePanelId: string | null;
}

/**
 * 根作用域槽位入口收到的标准属性。
 * 这两个钩子由 `shell.overlay` 槽位提供。
 */
export interface OverlayProps {
  readonly useSessions: <Selected>(
    selector: (state: SessionListLike) => Selected,
  ) => Selected | undefined;
  readonly usePanelInfo: <Selected>(
    selector: (info: PanelInfoLike) => Selected,
  ) => Selected | undefined;
}

/** 构建 `shell.overlay` 的弹幕组件。 */
export function createDanmuOverlay(
  source: DanmuSource,
  region: ConversationBoxStore,
  settings: DanmuSettingsStore,
): (props: OverlayProps) => ReactElement {
  return function DanmuOverlay(props: OverlayProps): ReactElement {
    const options = useSettings(settings);
    const optionsRef = useRef(options);
    const covered =
      props.usePanelInfo(info => info.activePanelId !== null) === true;
    const sessionId = props.useSessions(state =>
      covered ? undefined : currentSessionId(state),
    );
    const hostRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const engineRef = useRef<DanmuOverlayEngine | null>(null);
    const lastBandRef = useRef<BandRect | null>(null);
    const [layer, setLayer] = useState({
      width: 0,
      height: 0,
      left: 0,
      top: 0,
    });

    useSyncExternalStore(region.subscribe, region.getSnapshot);

    const box = region.read();
    const measuredBand =
      box === null || layer.width === 0 ? null : bandRect(box, layer);

    // 探针在宿主重渲染时可能有一帧为空，沿用布局上次量到的区域。
    useLayoutEffect(() => {
      if (measuredBand !== null) {
        lastBandRef.current = measuredBand;
      }
    }, [measuredBand]);

    const band = measuredBand ?? lastBandRef.current;

    useEffect(() => {
      optionsRef.current = options;
      engineRef.current?.setOptions(options);
    }, [options]);
    useEffect(() => {
      const node = hostRef.current;

      if (node === null) {
        return undefined;
      }
      const measure = () => {
        const rect = node.getBoundingClientRect();

        setLayer(previous =>
          previous.width === rect.width &&
          previous.height === rect.height &&
          previous.left === rect.left &&
          previous.top === rect.top
            ? previous
            : {
                width: rect.width,
                height: rect.height,
                left: rect.left,
                top: rect.top,
              },
        );
      };
      measure();

      const observer = new ResizeObserver(measure);

      observer.observe(node);

      return () => observer.disconnect();
    }, []);
    useEffect(() => {
      const container = containerRef.current;

      if (container === null) {
        return undefined;
      }
      const engine = new DanmuOverlayEngine(
        container,
        region,
        optionsRef.current,
      );

      engineRef.current = engine;

      return () => {
        engine.destroy();
        engineRef.current = null;
      };
    }, [region]);

    const clearRendered = useCallback(() => {
      engineRef.current?.clear();
    }, []);

    // 切换会话时，上一会话的弹幕不应继续显示。
    useEffect(() => {
      clearRendered();
    }, [sessionId, clearRendered]);

    const push = useCallback((textData: TextData) => {
      engineRef.current?.push(textData);
    }, []);

    useEffect(() => source.attach(sessionId, push), [source, sessionId, push]);

    return (
      <div
        ref={hostRef}
        aria-hidden="true"
        data-danmu-overlay=""
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div
          ref={containerRef}
          data-danmu-container=""
          style={{
            position: 'absolute',
            left: band === null ? 0 : `${band.left}px`,
            top: band === null ? 0 : `${band.top}px`,
            width: band === null ? 0 : `${band.width}px`,
            height: band === null ? 0 : `${band.height}px`,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  };
}

/**
 * Conversation 正在显示的会话，即主视图持有的会话。
 * 没有可直接使用的钩子，浮层读取宿主界面使用的同一份状态。
 * 全帧面板覆盖时浮层停止显示，该面板移除输入框槽位后标记点消失，
 * 活动区域也随之消失。
 */
function currentSessionId(state: SessionListLike): string | undefined {
  for (const id of state.ids) {
    if ((state.byId[id]?.retainedBy?.mainView ?? 0) > 0) {
      return id;
    }
  }
  return undefined;
}
