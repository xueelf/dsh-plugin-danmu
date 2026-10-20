/**
 * 将解码器挂接到浮层当前显示的会话。
 *
 * 浮层运行在帧根上，不直接持有会话。
 * 组件从标准槽位属性取得当前会话 id 后交给本模块。
 * 订阅只引用现有绑定，不延长已关闭会话的生命周期。
 */

import { type SessionChangeLike, type TextData, DanmuDecoder } from './decoder';

/**
 * 弹幕数据源。浮层向它声明当前显示的会话，并渲染它发出的条目。
 */
export interface DanmuSource {
  /**
   * 将 `sessionId` 的每条活动转换为一条弹幕，直到返回的 disposer 被调用。
   * `sessionId` 为 undefined 时仅解除订阅，不产生条目。
   */
  attach(
    sessionId: string | undefined,
    emit: (textData: TextData) => void,
  ): () => void;
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
  binding(
    sessionId: string,
  ): { readonly eventSource: EventSourceLike } | undefined;
  /** 本地引用计数，不持有会话。 */
  retainInfo(sessionId: string): ObservableLike;
  /** 会话列表，某个会话被持有时它会变化。 */
  readonly list: ObservableLike;
}

/** 数据源所需的 Client 上下文切片。 */
export interface SourceContext {
  readonly sessions: SessionsLike;
}

export function createSessionSource(ctx: SourceContext): DanmuSource {
  const decoder = new DanmuDecoder();

  return {
    attach(sessionId, emit) {
      if (sessionId === undefined) {
        return noop;
      }
      const stops: (() => void)[] = [];
      const attachEvents = (): boolean => {
        const binding = ctx.sessions.binding(sessionId);

        if (binding === undefined) {
          return false;
        }
        const eventSource = binding.eventSource;

        // 仅处理触发回调时的变化。窗口仍包含更早的事件，
        // 重放会得到历史数据，不属于当前活动。
        stops.push(
          eventSource.subscribe(() => {
            for (const entry of decoder.change(
              eventSource.getSnapshot().change,
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
        if (watchers.length === 0 || !attachEvents()) {
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
