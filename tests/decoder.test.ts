import { expect, test } from 'bun:test';
import {
  type SessionChangeLike,
  type SessionEntryLike,
  type TextData,
  applyCommittedEvent,
  INITIAL_DANMU_STATE,
  Mode,
} from '#/conversation/decoder';
import { LiveDanmuDecoder } from '#/conversation/live';

class DanmuDecoder {
  private state = INITIAL_DANMU_STATE;
  private readonly live = new LiveDanmuDecoder();

  change(change: SessionChangeLike): TextData[] {
    if (change.kind === 'replace') {
      this.state = INITIAL_DANMU_STATE;
      this.live.reset();

      return [];
    }

    if (change.kind !== 'append') {
      return [];
    }
    const released: TextData[] = [];

    for (const entry of change.entries) {
      if (entry.type === 'transient') {
        released.push(
          ...this.live.change({ kind: 'append', entries: [entry] }),
        );

        continue;
      }
      const before = this.state.entries.length;

      this.state = applyCommittedEvent(this.state, entry.event);
      released.push(...this.state.entries.slice(before));

      if (entry.event.type === 'turn/end' || entry.event.type === 'step/end') {
        released.push(...this.live.flush());
      }
    }
    return released;
  }

  flush(): TextData[] {
    return this.live.flush();
  }
}
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
test('步骤开始', () => {
  const result = new DanmuDecoder().change(
    append(event('step/start', { turn: 1, step: 2 })),
  );

  expect(result).toEqual([{ mode: Mode.Top, text: '第 2 步' }]);
});
test('步骤缺少编号', () => {
  const result = new DanmuDecoder().change(
    append(event('step/start', { turn: 1 })),
  );

  expect(result).toEqual([]);
});
test('上下文压缩', () => {
  const decoder = new DanmuDecoder();

  expect(
    decoder.change(
      append(event('compaction/start', { compactionId: 'c1', turn: 1 })),
    ),
  ).toEqual([{ mode: Mode.Top, text: '正在压缩上下文…' }]);
  expect(
    decoder.change(
      append(event('compaction/end', { compactionId: 'c1', turn: 1 })),
    ),
  ).toEqual([{ mode: Mode.Top, text: '上下文已压缩' }]);
});
test('上下文压缩失败', () => {
  const result = new DanmuDecoder().change(
    append(
      event('compaction/end', {
        compactionId: 'c2',
        turn: 1,
        error: 'boom',
      }),
    ),
  );

  expect(result).toEqual([{ mode: Mode.Top, text: '上下文压缩失败' }]);
});
test('压缩事件没有轮次', () => {
  const result = new DanmuDecoder().change(
    append(event('compaction/start', { compactionId: 'c3', turn: null })),
  );

  expect(result).toEqual([{ mode: Mode.Top, text: '正在压缩上下文…' }]);
});
test('工具调用', () => {
  const result = new DanmuDecoder().change(
    append(
      event('tool/call', {
        turn: 1,
        step: 1,
        name: 'bash',
        arguments: JSON.stringify({
          command: 'bun test',
          description: 'Run tests',
        }),
      }),
    ),
  );

  expect(result).toEqual([{ mode: Mode.Roll, text: 'Run tests' }]);
});
test('工具调用空描述不发', () => {
  const result = new DanmuDecoder().change(
    append(
      event('tool/call', {
        turn: 1,
        step: 1,
        name: 'bash',
        arguments: JSON.stringify({
          command: 'git status',
          description: '',
        }),
      }),
    ),
  );

  expect(result).toEqual([]);
});
test('工具调用带读取前缀', () => {
  const result = new DanmuDecoder().change(
    append(
      event('tool/call', {
        turn: 1,
        step: 1,
        name: 'read',
        arguments: JSON.stringify({
          file_path: 'src/danmu/decoder.ts',
          limit: 40,
        }),
      }),
    ),
  );

  expect(result).toEqual([
    { mode: Mode.Roll, text: 'read src/danmu/decoder.ts' },
  ]);
});
test('工具调用带写入前缀', () => {
  const result = new DanmuDecoder().change(
    append(
      event('tool/call', {
        turn: 1,
        step: 1,
        name: 'write',
        arguments: JSON.stringify({
          file_path: 'package.json',
          content: '{}',
        }),
      }),
    ),
  );

  expect(result).toEqual([{ mode: Mode.Roll, text: 'write package.json' }]);
});
test('工具调用带抓取前缀', () => {
  const result = new DanmuDecoder().change(
    append(
      event('tool/call', {
        turn: 1,
        step: 1,
        name: 'web_fetch',
        arguments: JSON.stringify({ url: 'https://example.com' }),
      }),
    ),
  );

  expect(result).toEqual([
    { mode: Mode.Roll, text: 'web_fetch https://example.com' },
  ]);
});
test('工具调用缺少描述不发', () => {
  const result = new DanmuDecoder().change(
    append(
      event('tool/call', {
        turn: 1,
        step: 1,
        name: 'bash',
        arguments: JSON.stringify({ command: 'echo one\necho two' }),
      }),
    ),
  );

  expect(result).toEqual([]);
});
test('工具调用跳过会话自检', () => {
  const decoder = new DanmuDecoder();

  expect(
    decoder.change(
      append(
        event('tool/call', {
          turn: 1,
          step: 1,
          name: 'session_event_read',
          arguments: JSON.stringify({ seq: 796, session_id: 's' }),
        }),
      ),
    ),
  ).toEqual([]);
  expect(
    decoder.change(
      append(
        event('tool/call', {
          turn: 1,
          step: 1,
          name: 'session_trace',
          arguments: JSON.stringify({ session_id: 's' }),
        }),
      ),
    ),
  ).toEqual([]);
});
test('工具调用数组参数', () => {
  const result = new DanmuDecoder().change(
    append(
      event('tool/call', {
        turn: 1,
        step: 1,
        name: 'web_search',
        arguments: JSON.stringify({ queries: ['bun', 'test'] }),
      }),
    ),
  );

  expect(result).toEqual([{ mode: Mode.Roll, text: 'web_search bun test' }]);
});
test('工具调用回退到第一个字符串参数', () => {
  const result = new DanmuDecoder().change(
    append(
      event('tool/call', {
        turn: 1,
        step: 1,
        name: 'custom',
        arguments: JSON.stringify({ count: 3, label: 'do it' }),
      }),
    ),
  );

  expect(result).toEqual([{ mode: Mode.Roll, text: 'custom do it' }]);
});
test('工具调用参数不可解析', () => {
  const result = new DanmuDecoder().change(
    append(
      event('tool/call', {
        turn: 1,
        step: 1,
        name: 'bash',
        arguments: '{',
      }),
    ),
  );

  expect(result).toEqual([]);
});
test('模型重试排期', () => {
  const result = new DanmuDecoder().change(
    append(
      event('llm/retry', {
        turn: 1,
        retryId: 'r1',
        retry: 2,
        maxRetries: 5,
        mode: 'normal',
      }),
    ),
  );

  expect(result).toEqual([{ mode: Mode.Top, text: '等待重试模型请求（2/5）' }]);
});
test('模型重试开始', () => {
  const decoder = new DanmuDecoder();

  decoder.change(
    append(
      event('llm/retry', {
        turn: 1,
        retryId: 'r1',
        retry: 2,
        maxRetries: 5,
        mode: 'normal',
      }),
    ),
  );
  expect(
    decoder.change(
      append(event('llm/retry-started', { turn: 1, retryId: 'r1', retry: 2 })),
    ),
  ).toEqual([{ mode: Mode.Top, text: '正在重试模型请求（2/5）' }]);
});
test('无限重试与缺少排期', () => {
  const decoder = new DanmuDecoder();

  expect(
    decoder.change(
      append(
        event('llm/retry', {
          turn: 1,
          retryId: 'r2',
          retry: 1,
          mode: 'always',
        }),
      ),
    ),
  ).toEqual([{ mode: Mode.Top, text: '等待重试模型请求（1）' }]);
  expect(
    decoder.change(
      append(
        event('llm/retry-started', {
          turn: 1,
          retryId: 'missing',
          retry: 1,
        }),
      ),
    ),
  ).toEqual([{ mode: Mode.Top, text: '正在重试模型请求（1）' }]);
});
test('重试缺少次数', () => {
  const result = new DanmuDecoder().change(
    append(event('llm/retry', { turn: 1, retryId: 'r3', mode: 'normal' })),
  );

  expect(result).toEqual([]);
});
test('推理增量', () => {
  const result = new DanmuDecoder().change(
    append(
      live({ type: 'reasoning-delta', index: 0, text: 'Alpha. Beta.\n\n' }),
    ),
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
