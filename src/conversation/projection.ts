/**
 * 已落盘会话事件的 Host 投影。
 *
 * 官方 `dsh-session-projection` 用 `apply` 同步折叠日志事件，
 * `wire.view` 把完整当前值发给 Client。实时 reasoning chunk
 * 不进入这里，由 Client 的 live decoder 处理。
 */

import { z } from 'zod';
import {
  type DanmuState,
  type DurableEventLike,
  applyCommittedEvent,
  INITIAL_DANMU_STATE,
} from './decoder';

const textDataSchema = z.object({
  mode: z.number(),
  text: z.string(),
});
const stateSchema = z.object({
  entries: z.array(textDataSchema),
  turnStarts: z.record(z.string(), z.number()),
  retryLimits: z.record(z.string(), z.number()),
  flush: z.number().int(),
});
const viewSchema = z.object({
  entries: z.array(textDataSchema),
  flush: z.number().int(),
});

export const danmuProjectionDefinition = {
  key: 'danmu',
  stateSchema,
  stateVersion: 1,
  init: (): DanmuState => INITIAL_DANMU_STATE,
  apply: (state: DanmuState, event: DurableEventLike): DanmuState =>
    applyCommittedEvent(state, event),
  wire: {
    viewSchema,
    view: (state: DanmuState) => ({
      entries: state.entries,
      flush: state.flush,
    }),
  },
};
