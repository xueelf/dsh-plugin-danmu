/**
 * 将 Host 弹幕投影和 Client 实时 chunk 接到浮层。
 *
 * 已落盘事件由 Host session projection 折叠，
 * 这里只读取投影面，并单独消费 transient 的 reasoning chunk。
 */

import { type SessionChangeLike, type TextData } from './decoder';
import { LiveDanmuDecoder } from './live';

/** 一个 Host projection 在 Client 的只读面。 */
export interface ProjectionFace {
  getSnapshot():
    | {
        readonly entries: readonly TextData[];
        readonly flush: number;
      }
    | undefined;
  subscribe(listener: () => void): () => void;
}

/** 会话上的 projection 集合。 */
export interface SessionProjectionsLike {
  faceOf(key: string): ProjectionFace;
}

/** 持有 projections 的 Client Session。 */
export interface SessionLike {
  readonly projections: SessionProjectionsLike;
}

/** 一个会话的实时事件窗口。 */
export interface EventSourceLike {
  getSnapshot(): { readonly change: SessionChangeLike };
  subscribe(listener: () => void): () => void;
}

/** Client 发布并会通知变化的只读值。 */
export interface ObservableLike {
  subscribe(listener: () => void): () => void;
}

export interface SessionsLike {
  /** 一个已被持有的会话的实时绑定，没有时返回 undefined。 */
  binding(sessionId: string):
    | {
        readonly eventSource: EventSourceLike;
        readonly session: SessionLike;
      }
    | undefined;
  /** 本地引用计数，不持有会话。 */
  retainInfo(sessionId: string): ObservableLike;
  /** 会话列表，某个会话被持有时它会变化。 */
  readonly list: ObservableLike;
}

/** 数据源所需的 Client 上下文切片。 */
export interface SourceContext {
  readonly sessions: SessionsLike;
}

export interface DanmuSource {
  /**
   * 将 `sessionId` 的投影和实时 chunk 接到浮层，直到返回的 disposer 被调用。
   * `sessionId` 为 undefined 时仅解除订阅，不产生条目。
   */
  attach(
    sessionId: string | undefined,
    emit: (textData: TextData) => void,
  ): () => void;
}

export function createSessionSource(ctx: SourceContext): DanmuSource {
  const live = new LiveDanmuDecoder();

  return {
    attach(sessionId, emit) {
      live.reset();

      if (sessionId === undefined) {
        return noop;
      }
      const stops: (() => void)[] = [];

      let primed = false;
      let seenEntries = 0;
      let seenFlush = 0;

      const attachBinding = (): boolean => {
        const binding = ctx.sessions.binding(sessionId);

        if (binding === undefined) {
          return false;
        }
        const face = binding.session.projections.faceOf('danmu');
        const initial = face.getSnapshot();

        primed = initial !== undefined;
        seenEntries = initial?.entries.length ?? 0;
        seenFlush = initial?.flush ?? 0;
        stops.push(
          face.subscribe(() => {
            const view = face.getSnapshot();

            if (view === undefined) {
              return;
            }

            if (!primed) {
              primed = true;
              seenEntries = view.entries.length;
              seenFlush = view.flush;

              return;
            }

            for (
              let index = seenEntries;
              index < view.entries.length;
              index += 1
            ) {
              const entry = view.entries[index];

              if (entry !== undefined) {
                emit(entry);
              }
            }
            seenEntries = view.entries.length;

            if (view.flush !== seenFlush) {
              seenFlush = view.flush;

              for (const entry of live.flush()) {
                emit(entry);
              }
            }
          }),
        );
        stops.push(
          binding.eventSource.subscribe(() => {
            for (const entry of live.change(
              binding.eventSource.getSnapshot().change,
            )) {
              emit(entry);
            }
          }),
        );

        return true;
      };
      // Conversation 会持有正在渲染的会话。在持有之前没有可用绑定，
      // 这两个订阅用于检测持有状态，订阅成功后即解除。
      const watchers: (() => void)[] = [];
      const tryAttach = () => {
        if (watchers.length === 0 || !attachBinding()) {
          return;
        }

        for (const stop of watchers.splice(0)) {
          stop();
        }
      };
      watchers.push(
        ctx.sessions.list.subscribe(tryAttach),
        ctx.sessions.retainInfo(sessionId).subscribe(tryAttach),
      );
      tryAttach();

      return () => {
        for (const stop of watchers.splice(0)) {
          stop();
        }

        for (const stop of stops) {
          stop();
        }
      };
    },
  };
}

function noop(): void {}
