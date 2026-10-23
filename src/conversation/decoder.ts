/**
 * 会话事件到弹幕文本的纯映射层。
 *
 * 已落盘事件由 Host 的 session projection 调用这里，
 * Client 不再折叠这些事件。实时 reasoning chunk 不在这里，
 * 它由 `live.ts` 处理。
 */

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

/** 已落盘事件折叠出的弹幕状态。 */
export interface DanmuState {
  readonly entries: readonly TextData[];
  readonly turnStarts: Readonly<Record<number, number>>;
  readonly retryLimits: Readonly<Record<string, number>>;
  /** 实时 reasoning 的 flush 计数，Client 看到变化时清空当前片段。 */
  readonly flush: number;
}

export const INITIAL_DANMU_STATE: DanmuState = {
  entries: [],
  turnStarts: {},
  retryLimits: {},
  flush: 0,
};

function append(
  state: DanmuState,
  entries: readonly TextData[],
  patch: Partial<Pick<DanmuState, 'turnStarts' | 'retryLimits' | 'flush'>> = {},
): DanmuState {
  if (entries.length === 0) {
    return { ...state, ...patch };
  }
  return {
    ...state,
    ...patch,
    entries: [...state.entries, ...entries],
  };
}

/** 依据一条已落盘事件返回新的弹幕状态。 */
export function applyCommittedEvent(
  state: DanmuState,
  event: DurableEventLike,
): DanmuState {
  const data = readRecord(event.data);

  if (data === null) {
    return state;
  }

  if (event.type === 'compaction/start') {
    return append(state, [{ mode: Mode.Top, text: '正在压缩上下文…' }]);
  }

  if (event.type === 'compaction/end') {
    const error = readString(data.error);

    return append(state, [
      {
        mode: Mode.Top,
        text:
          error === null || error === '' ? '上下文已压缩' : '上下文压缩失败',
      },
    ]);
  }
  const turn = readNumber(data.turn);

  if (turn === null) {
    return state;
  }

  if (event.type === 'turn/start') {
    const turnStarts =
      event.time === undefined
        ? state.turnStarts
        : { ...state.turnStarts, [turn]: event.time };

    return append({ ...state, turnStarts }, [
      { mode: Mode.Top, text: `第 ${turn} 轮` },
    ]);
  }

  if (event.type === 'turn/end') {
    const turnStarts = { ...state.turnStarts };

    delete turnStarts[turn];

    return append({ ...state, turnStarts, flush: state.flush + 1 }, [
      {
        mode: Mode.Top,
        text: turnEndText(state, turn, event.time, data.reason),
      },
    ]);
  }

  if (event.type === 'step/start') {
    const step = readNumber(data.step);

    return step === null
      ? state
      : append(state, [{ mode: Mode.Top, text: `第 ${step} 步` }]);
  }

  if (event.type === 'step/end') {
    return { ...state, flush: state.flush + 1 };
  }

  if (event.type === 'tool/call') {
    const name = readString(data.name);
    const raw = readString(data.arguments);
    const text = name === null || raw === null ? null : toolCallText(name, raw);

    return text === null ? state : append(state, [{ mode: Mode.Roll, text }]);
  }

  if (event.type === 'llm/retry') {
    const retryId = readString(data.retryId);
    const retry = readNumber(data.retry);
    const max = readNumber(data.maxRetries);
    const retryLimits =
      retryId === null || max === null
        ? state.retryLimits
        : { ...state.retryLimits, [retryId]: max };

    return retry === null
      ? { ...state, retryLimits }
      : append({ ...state, retryLimits }, [
          {
            mode: Mode.Top,
            text: retryText('等待重试模型请求', retry, max),
          },
        ]);
  }

  if (event.type === 'llm/retry-started') {
    const retryId = readString(data.retryId);
    const retry = readNumber(data.retry);
    const max = retryId === null ? null : (state.retryLimits[retryId] ?? null);

    return retry === null
      ? state
      : append(state, [
          {
            mode: Mode.Top,
            text: retryText('正在重试模型请求', retry, max),
          },
        ]);
  }
  return state;
}

function turnEndText(
  state: DanmuState,
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
  const startTime = state.turnStarts[turn];

  if (startTime === undefined || endTime === undefined) {
    return '已完成';
  }
  return `已完成，用时 ${formatDuration(Math.max(1000, endTime - startTime))}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function readNumber(value: unknown): number | null {
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

/** 各工具取作弹幕文本的主参数。 */
const TOOL_ARGUMENT_KEYS: Readonly<Record<string, string>> = {
  read: 'file_path',
  read_image: 'file_path',
  write: 'file_path',
  edit: 'file_path',
  grep: 'pattern',
  glob: 'pattern',
  web_fetch: 'url',
  web_search: 'queries',
  session_search: 'query',
  session_event_search: 'query',
  skill: 'name',
  subagent: 'description',
  cordis_inspect_query: 'method',
};
/** 会话自检工具，不是智能体的任务活动，跳过。 */
const TOOL_SKIP = new Set(['session_event_read', 'session_trace']);

/** 把 tool/call 的参数摘要成一条弹幕文本。 */
function toolCallText(name: string, raw: string): string | null {
  if (TOOL_SKIP.has(name)) {
    return null;
  }
  const args = readArguments(raw);

  if (args === null) {
    return null;
  }

  if (name === 'bash') {
    return bashText(args);
  }
  const value = primaryArgument(name, args);

  if (value === null) {
    return null;
  }
  const text = oneLine(value);

  return text === '' ? null : `${name} ${text}`;
}

/** bash 用模型写的 description，缺失或为空时不发。 */
function bashText(args: Record<string, unknown>): string | null {
  const description = readString(args.description);

  if (description === null) {
    return null;
  }
  const text = oneLine(description);

  return text === '' ? null : text;
}

function oneLine(text: string): string {
  return text.replace(/[\r\n\t]+/gu, ' ').trim();
}

function readArguments(raw: string): Record<string, unknown> | null {
  try {
    return readRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

function primaryArgument(
  name: string,
  args: Record<string, unknown>,
): string | null {
  const key = TOOL_ARGUMENT_KEYS[name];
  const preferred = key === undefined ? null : argumentText(args[key]);

  if (preferred !== null && preferred !== '') {
    return preferred;
  }

  for (const value of Object.values(args)) {
    const text = argumentText(value);

    if (text !== null && text !== '') {
      return text;
    }
  }
  return null;
}

function argumentText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const parts = value.filter(
      (item): item is string => typeof item === 'string',
    );

    return parts.length === 0 ? null : parts.join(' ');
  }
  return null;
}
