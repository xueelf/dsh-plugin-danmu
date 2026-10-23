import { expect, test } from 'bun:test';
import {
  applyCommittedEvent,
  INITIAL_DANMU_STATE,
  Mode,
} from '#/conversation/decoder';
import { danmuProjectionDefinition } from '#/conversation/projection';

test('Host projection 折叠已落盘事件', () => {
  const started = applyCommittedEvent(INITIAL_DANMU_STATE, {
    type: 'turn/start',
    time: 1000,
    data: { turn: 1 },
  });
  const tool = applyCommittedEvent(started, {
    type: 'tool/call',
    data: {
      turn: 1,
      step: 1,
      name: 'bash',
      arguments: '{"description":"Run tests"}',
    },
  });
  const ended = applyCommittedEvent(tool, {
    type: 'turn/end',
    time: 3000,
    data: { turn: 1, reason: { kind: 'completed' } },
  });

  expect(ended.entries).toEqual([
    { mode: Mode.Top, text: '第 1 轮' },
    { mode: Mode.Roll, text: 'Run tests' },
    { mode: Mode.Top, text: '已完成，用时 2 秒' },
  ]);
  expect(ended.flush).toBe(1);
});
test('Host projection 只折叠已落盘事件', () => {
  expect(
    applyCommittedEvent(INITIAL_DANMU_STATE, {
      type: 'assistant/live-chunk',
      data: { chunk: { type: 'reasoning-delta', text: 'thinking' } },
    }),
  ).toBe(INITIAL_DANMU_STATE);
});
test('projection 定义可校验状态和 view', () => {
  const state = applyCommittedEvent(INITIAL_DANMU_STATE, {
    type: 'compaction/start',
    data: {},
  });

  expect(danmuProjectionDefinition.key).toBe('danmu');
  expect(danmuProjectionDefinition.stateVersion).toBe(1);
  expect(
    JSON.parse(
      JSON.stringify(danmuProjectionDefinition.stateSchema.parse(state)),
    ),
  ).toEqual(JSON.parse(JSON.stringify(state)));

  const view = danmuProjectionDefinition.wire.view(state);

  expect(view).toEqual({ entries: state.entries, flush: state.flush });
  expect(
    JSON.parse(
      JSON.stringify(danmuProjectionDefinition.wire.viewSchema.parse(view)),
    ),
  ).toEqual(JSON.parse(JSON.stringify(view)));
});
