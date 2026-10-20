/**
 * 会话事件到弹幕的映射层。
 */

/**
 * 会话事件目录如下。
 *
 * 事件名取自 `@deepseek-ai/dsh-session` 的 `KNOWN_SESSION_EVENT_TYPES`，
 * 共 62 个持久事件，另有瞬时的 `assistant/live-chunk` 流。
 * 方括号内为接入状态，`[已接入]` 表示解码器将其转换为弹幕，
 * `[部分接入]` 表示仅使用其中部分字段，`[未接入]` 表示尚未接入。
 * 事件名与载荷以 `dsh-session` 及声明该事件的插件为准。
 *
 * 模型消息（surface，5 项）如下。
 * - [未接入] system/message：系统提示词正文。
 * - [未接入] developer/message：开发者指令与注入上下文。
 * - [未接入] user/message：用户输入或注入的用户上下文。
 * - [未接入] assistant/message：模型最终回复，含正文与推理块。
 * - [未接入] tool/result：工具结果，含结果内容与失败原因。
 *
 * 生成过程如下。
 * - [未接入] assistant/live-chunk（瞬时流），
 *   reasoning-delta、text-delta 与 tool-call-delta 均未接入。
 * - [未接入] assistant/attempt：失败、重试或取消的模型尝试记录。
 * - [未接入] llm/retry / llm/retry-started：模型重试与重试启动。
 *
 * 轮次与步骤如下。
 * - [未接入] turn/start / turn/end。
 * - [未接入] step/start / step/end。
 *
 * 工具与行动如下。
 * - [未接入] tool/call。
 * - [未接入] tool/ptc-dispatch / tool/ptc-dispatch-start。
 * - [未接入] tool-workflow/agent-start、tool-workflow/agent-end，
 *   tool-workflow/run-start、tool-workflow/run-end。
 *
 * 任务与状态如下。
 * - [未接入] todo/write。
 * - [未接入] plan/mode / goal/change / schedule/change。
 * - [未接入] job/registered / job/settled。
 *
 * 审批与权限如下。
 * - [未接入] approval/asked / approval/decided / approval/policy。
 * - [未接入] permission/preset / sandbox/mode。
 *
 * 上下文压缩如下。
 * - [未接入] compaction/start、compaction/end，
 *   compaction/prune、compaction/summary。
 *
 * 子代理与团队如下。
 * - [未接入] subagent/catalog / subagent/descriptor / subagent/model-selection-policy。
 * - [未接入] team/member / team/task / team/message/queued / team/message/delivered。
 *
 * 工作区与交付如下。
 * - [未接入] workspace/changes / working-directory/change / deliverables/presented。
 *
 * 外围如下。
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
  /** 稳定标识，同一标识不会重复出现。 */
  readonly id: string;
  readonly mode: Mode;
  readonly text: string;
}

/** 一条已落盘的会话事件。 */
export interface DurableEventLike {
  readonly type: string;
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
  change(_change: SessionChangeLike): TextData[] {
    return [];
  }
}
