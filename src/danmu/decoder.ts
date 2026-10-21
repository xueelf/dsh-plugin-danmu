/**
 * 会话事件到弹幕的映射层。
 */

/**
 * 会话事件目录。
 *
 * 事件名取自 `@deepseek-ai/dsh-session` 的 `KNOWN_SESSION_EVENT_TYPES`，
 * 共 62 个持久事件，另有瞬时的 `assistant/live-chunk` 流。
 * 方括号内为接入状态，`[已接入]` 表示解码器将其转换为弹幕，
 * `[部分接入]` 表示仅使用其中部分字段，`[未接入]` 表示尚未接入。
 * 事件名与载荷以 `dsh-session` 及声明该事件的插件为准。
 *
 * 模型消息（surface，5 项）。
 * - [未接入] system/message：系统提示词正文。
 * - [未接入] developer/message：开发者指令与注入上下文。
 * - [未接入] user/message：用户输入或注入的用户上下文。
 * - [未接入] assistant/message：模型最终回复，含正文与推理块。
 * - [未接入] tool/result：工具结果，含结果内容与失败原因。
 *
 * 生成过程。
 * - [部分接入] assistant/live-chunk（瞬时流），
 *   reasoning-delta 已接入，text-delta 与 tool-call-delta 未接入。
 * - [未接入] assistant/attempt：失败、重试或取消的模型尝试记录。
 * - [已接入] llm/retry / llm/retry-started，顶部弹幕。
 *
 * 轮次与步骤。
 * - [已接入] turn/start / turn/end / step/start，顶部弹幕。
 * - [部分接入] step/end，用于收尾。
 *
 * 工具与行动。
 * - [未接入] tool/call。
 * - [未接入] tool/ptc-dispatch / tool/ptc-dispatch-start。
 * - [未接入] tool-workflow/agent-start、tool-workflow/agent-end，
 *   tool-workflow/run-start、tool-workflow/run-end。
 *
 * 任务与状态。
 * - [未接入] todo/write。
 * - [未接入] plan/mode / goal/change / schedule/change。
 * - [未接入] job/registered / job/settled。
 *
 * 审批与权限。
 * - [未接入] approval/asked / approval/decided / approval/policy。
 * - [未接入] permission/preset / sandbox/mode。
 *
 * 上下文压缩。
 * - [未接入] compaction/start、compaction/end，
 *   compaction/prune、compaction/summary。
 *
 * 子代理与团队。
 * - [未接入] subagent/catalog / subagent/descriptor / subagent/model-selection-policy。
 * - [未接入] team/member / team/task / team/message/queued / team/message/delivered。
 *
 * 工作区与交付。
 * - [未接入] workspace/changes / working-directory/change / deliverables/presented。
 *
 * 外围。
 * - [未接入] command/run / command/done。
 * - [未接入] feedback/record / feedback/message-put / feedback/message-delete。
 * - [未接入] hook/invoked / hook/result。
 * - [未接入] image/offload。
 * - [未接入] model/selection / agent-preset/selected / agent/inbox/spliced。
 * - [未接入] request/context / request/header。
 * - [未接入] session/end-seed / session/title / session/title-llm-request。
 * - [未接入] web/deepseek-search-llm-request。
 * - [未接入] session-log-deepseek/delivery-accepted。
 */

import { type Snippet, SnippetBuffer } from './snippet';

/** 弹幕模式，取值与 B 站网页端的 `mode` 枚举一致。 */
export const Mode = {
  Roll: 1,
  Bottom: 4,
  Top: 5,
  Reverse: 6,
} as const;

export type Mode = (typeof Mode)[keyof typeof Mode];

/** 一条进入弹幕渲染的数据。 */
export interface TextData {
  readonly mode: Mode;
  readonly text: string;
}

/** 一条已落盘的会话事件。 */
export interface DurableEventLike {
  readonly type: string;
  readonly time?: number;
  readonly data?: unknown;
}

/** 模型流式输出时，会话存储发出的实时分块信封。 */
export interface LiveChunkLike {
  readonly type: string;
  readonly data?: unknown;
}

/** 实时事件窗口里的一条：已落盘的历史，或者一个实时分块。 */
export type SessionEntryLike =
  | { readonly type: 'event'; readonly event: DurableEventLike }
  | { readonly type: 'transient'; readonly event: LiveChunkLike };

/** 会话窗口的一次变化，采用存储给出的形式。 */
export type SessionChangeLike =
  | { readonly kind: 'replace' }
  | { readonly kind: 'prepend' }
  | { readonly kind: 'append'; readonly entries: readonly SessionEntryLike[] }
  | { readonly kind: 'settle-assistant'; readonly attemptId: string };

export class DanmuDecoder {
  private readonly turnStarts = new Map<number, number>();
  private readonly retryLimits = new Map<string, number>();
  private readonly snippets = new SnippetBuffer();

  /** 清空跨会话状态。 */
  reset(): void {
    this.turnStarts.clear();
    this.retryLimits.clear();
    this.snippets.reset();
  }

  change(change: SessionChangeLike): TextData[] {
    if (change.kind === 'replace') {
      this.reset();

      return [];
    }

    if (change.kind !== 'append') {
      return [];
    }
    const released: TextData[] = [];

    for (const entry of change.entries) {
      if (entry.type === 'transient') {
        released.push(...this.live(entry.event));

        continue;
      }
      const event = entry.event;
      const data = readRecord(event.data);

      if (data === null) {
        continue;
      }
      const turn = readNumber(data.turn);

      if (turn === null) {
        continue;
      }

      if (event.type === 'turn/start') {
        if (event.time !== undefined) {
          this.turnStarts.set(turn, event.time);
        }
        released.push({
          mode: Mode.Top,
          text: `第 ${turn} 轮`,
        });
      } else if (event.type === 'turn/end') {
        released.push({
          mode: Mode.Top,
          text: this.turnEndText(turn, event.time, data.reason),
        });
        this.turnStarts.delete(turn);
        released.push(...this.flushSnippets());
      } else if (event.type === 'step/start') {
        const step = readNumber(data.step);

        if (step !== null) {
          released.push({ mode: Mode.Top, text: `第 ${step} 步` });
        }
      } else if (event.type === 'step/end') {
        released.push(...this.flushSnippets());
      } else if (event.type === 'llm/retry') {
        const retryId = readString(data.retryId);
        const retry = readNumber(data.retry);
        const max = readNumber(data.maxRetries);

        if (retryId !== null && max !== null) {
          this.retryLimits.set(retryId, max);
        }

        if (retry !== null) {
          released.push({
            mode: Mode.Top,
            text: retryText('等待重试模型请求', retry, max),
          });
        }
      } else if (event.type === 'llm/retry-started') {
        const retryId = readString(data.retryId);
        const retry = readNumber(data.retry);
        const max =
          retryId === null ? null : (this.retryLimits.get(retryId) ?? null);

        if (retry !== null) {
          released.push({
            mode: Mode.Top,
            text: retryText('正在重试模型请求', retry, max),
          });
        }
      }
    }
    return released;
  }

  private live(event: LiveChunkLike): TextData[] {
    if (event.type !== 'assistant/live-chunk') {
      return [];
    }
    const data = readRecord(event.data);

    if (data === null) {
      return [];
    }
    const chunk = readRecord(data.chunk);

    if (chunk === null) {
      return [];
    }
    const text = readString(chunk.text);

    if (chunk.type === 'reasoning-delta' && text !== null) {
      return this.emitSnippets(this.snippets.push(text));
    }

    if (chunk.type === 'block-end') {
      const block = readRecord(chunk.block);

      if (readString(block?.type) === 'reasoning') {
        return this.emitSnippets(this.snippets.flush());
      }
    }
    return [];
  }

  private emitSnippets(snippets: readonly Snippet[]): TextData[] {
    return snippets.map(snippet => ({
      mode: snippet.kind === 'table' ? Mode.Top : Mode.Roll,
      text: snippet.text,
    }));
  }

  private flushSnippets(): TextData[] {
    return this.emitSnippets(this.snippets.flush());
  }

  private turnEndText(
    turn: number,
    endTime: number | undefined,
    reason: unknown,
  ): string {
    const kind = readString(readRecord(reason)?.kind);

    if (kind === 'aborted' || kind === 'interrupted') {
      return '已停止';
    }

    if (kind === 'error') {
      return '处理失败';
    }
    const startTime = this.turnStarts.get(turn);

    if (startTime === undefined || endTime === undefined) {
      return '已完成';
    }
    return `已完成，用时 ${formatDuration(Math.max(1000, endTime - startTime))}`;
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 与 DSH 客户端一致的轮次耗时格式。 */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const seconds = total % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours} 小时`);
  }

  if (total >= 60) {
    parts.push(`${minutes} 分`);
  }
  parts.push(`${seconds} 秒`);

  return parts.join(' ');
}

/** 与 DSH 客户端一致的重试状态文案，例如「等待重试模型请求（1/5）」。 */
function retryText(label: string, retry: number, max: number | null): string {
  return max === null ? `${label}（${retry}）` : `${label}（${retry}/${max}）`;
}
