import { expect, test } from 'bun:test';
import {
  type SessionChangeLike,
  type SessionEntryLike,
  DanmuDecoder,
  Mode,
} from '#/danmu/decoder';

const event = (
  type: string,
  data: unknown,
  time?: number,
): SessionEntryLike => ({
  type: 'event',
  event: { type, data, time },
});
const append = (...entries: SessionEntryLike[]): SessionChangeLike => ({
  kind: 'append',
  entries,
});
const live = (chunk: unknown, turn = 1, step = 1): SessionEntryLike => ({
  type: 'transient',
  event: {
    type: 'assistant/live-chunk',
    data: { attemptId: 'a', turn, step, chunk },
  },
});

test('轮次开始', () => {
  const result = new DanmuDecoder().change(
    append(event('turn/start', { turn: 1 }, 1000)),
  );

  expect(result).toEqual([{ mode: Mode.Top, text: '第 1 轮' }]);
});
test('轮次完成', () => {
  const decoder = new DanmuDecoder();

  decoder.change(append(event('turn/start', { turn: 1 }, 1000)));

  const result = decoder.change(
    append(event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 7000)),
  );

  expect(result).toEqual([{ mode: Mode.Top, text: '已完成，用时 6 秒' }]);
});
test('轮次停止与失败', () => {
  const decoder = new DanmuDecoder();

  decoder.change(append(event('turn/start', { turn: 1 }, 1000)));
  expect(
    decoder.change(
      append(event('turn/end', { turn: 1, reason: { kind: 'aborted' } }, 2000)),
    ),
  ).toEqual([{ mode: Mode.Top, text: '已停止' }]);
  expect(
    decoder.change(
      append(event('turn/end', { turn: 2, reason: { kind: 'error' } }, 2000)),
    ),
  ).toEqual([{ mode: Mode.Top, text: '处理失败' }]);
});
test('轮次耗时分钟', () => {
  const decoder = new DanmuDecoder();

  decoder.change(append(event('turn/start', { turn: 1 }, 0)));

  const result = decoder.change(
    append(
      event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 65_000),
    ),
  );

  expect(result).toEqual([{ mode: Mode.Top, text: '已完成，用时 1 分 5 秒' }]);
});
test('推理增量', () => {
  const result = new DanmuDecoder().change(
    append(live({ type: 'reasoning-delta', index: 0, text: 'Alpha. Beta.\n' })),
  );

  expect(result.map(entry => entry.text)).toEqual(['Alpha. Beta.']);
  expect(result.every(entry => entry.mode === Mode.Roll)).toBe(true);
});
test('表格顶部弹幕', () => {
  const result = new DanmuDecoder().change(
    append(
      live({
        type: 'reasoning-delta',
        index: 0,
        text: '| a | b |\n| --- | --- |\n| c | d |\n\n',
      }),
    ),
  );

  expect(result.map(entry => entry.text)).toEqual([
    '| a | b |',
    '| --- | --- |',
    '| c | d |',
  ]);
  expect(result.every(entry => entry.mode === Mode.Top)).toBe(true);
});
test('推理收尾', () => {
  const decoder = new DanmuDecoder();

  expect(
    decoder.change(
      append(live({ type: 'reasoning-delta', index: 0, text: 'unfinished' })),
    ),
  ).toEqual([]);

  const result = decoder.change(
    append(
      live({
        type: 'block-end',
        index: 0,
        block: { type: 'reasoning', text: 'unfinished' },
      }),
    ),
  );

  expect(result.map(entry => entry.text)).toEqual(['unfinished']);
});
test('忽略正文增量', () => {
  const result = new DanmuDecoder().change(
    append(live({ type: 'text-delta', index: 1, text: 'reply' })),
  );

  expect(result).toEqual([]);
});
test('缺少开始时间', () => {
  const result = new DanmuDecoder().change(
    append(event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 5000)),
  );

  expect(result).toEqual([{ mode: Mode.Top, text: '已完成' }]);
});
