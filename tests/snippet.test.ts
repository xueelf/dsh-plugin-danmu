import { expect, test } from 'bun:test';
import { type Snippet, SnippetBuffer } from '#/conversation/snippet';

function texts(snippets: readonly Snippet[]): string[] {
  return snippets.map(snippet => snippet.text);
}

test('半行不处理', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('没有换行')).toEqual([]);
  expect(buffer.push('，继续')).toEqual([]);
  expect(buffer.push('\n')).toEqual([]);
  expect(texts(buffer.flush())).toEqual(['没有换行，继续']);
});
test('整行一条', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('# 什么？！你居然写了一个弹幕插件？\n\n'))).toEqual([
    '什么？！你居然写了一个弹幕插件？',
  ]);
});
test('超长才切', () => {
  const buffer = new SnippetBuffer();
  const released = texts(buffer.push(`${'第一句。'.repeat(30)}\n\n`));

  expect(released).toHaveLength(30);
  expect(new Set(released)).toEqual(new Set(['第一句。']));
});
test('长单句不截断', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push(`${'x'.repeat(150)}\n\n`))).toEqual([
    'x'.repeat(150),
  ]);
});
test('单句一行', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('The allocator picks a lane.\n\n'))).toEqual([
    'The allocator picks a lane.',
  ]);
});
test('多行逐条', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('第一行。\n第二行。\n\n'))).toEqual([
    '第一行。\n第二行。',
  ]);
});
test('空行不发送', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('  \n\n')).toEqual([]);
  expect(buffer.flush()).toEqual([]);
});
test('半行 flush', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('没有换行')).toEqual([]);
  expect(texts(buffer.flush())).toEqual(['没有换行']);
});
test('空格保留', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('用时  3  秒\n')).toEqual([]);
  expect(texts(buffer.flush())).toEqual(['用时  3  秒']);
  expect(texts(buffer.push('  用时 3 秒  \n\n'))).toEqual(['  用时 3 秒  ']);
});
test('列表逐行', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('- 第一项\n- 第二项\n\n'))).toEqual([
    '第一项\n第二项',
  ]);
});
test('代码块跳过', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('before.\n```js\nconst'))).toEqual(['before.']);
  expect(buffer.push(' x = 1;\n')).toEqual([]);
  expect(texts(buffer.push('```\nafter.\n\n'))).toEqual(['after.']);
});
test('未闭合代码块', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('```js\ncode')).toEqual([]);
  expect(texts(buffer.flush())).toEqual(['`js', 'code']);
});
test('单反引号不是围栏', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('`\ncontent\n\n'))).toEqual(['`\ncontent']);
});
test('四反引号不是围栏', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('````md\ncontent\n\n'))).toEqual(['``md\ncontent']);
});
test('表格整段同步', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('| a | b |\n| --- | --- |\n')).toEqual([]);
  expect(buffer.push('| c | d |\n')).toEqual([]);

  const snippets = buffer.push('after.\n\n');

  expect(texts(snippets)).toEqual([
    '| a | b |',
    '| --- | --- |',
    '| c | d |',
    'after.',
  ]);
  expect(snippets.map(snippet => snippet.kind)).toEqual([
    'table',
    'table',
    'table',
    'text',
  ]);
});
test('表格行不切分', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('| 第一句。第二句。 |\n| --- |\n')).toEqual([]);
  expect(texts(buffer.push('\n'))).toEqual(['| 第一句。第二句。 |', '| --- |']);
});
test('表格行不截断', () => {
  const buffer = new SnippetBuffer();
  const row = `| ${'x'.repeat(150)} |`;

  expect(buffer.push(`${row}\n| --- |\n`)).toEqual([]);
  expect(texts(buffer.push('\n'))).toEqual([row, '| --- |']);
});
test('表格无前导竖线', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('a | b\n--- | ---\n')).toEqual([]);
  expect(buffer.push('table skip | x\n')).toEqual([]);
  expect(texts(buffer.push('after.\n\n'))).toEqual([
    'a | b',
    '--- | ---',
    'table skip | x',
    'after.',
  ]);
});
test('紧凑表格', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('a|b\n---|---\n')).toEqual([]);
  expect(buffer.push('c|d\n')).toEqual([]);
  expect(texts(buffer.push('after.\n\n'))).toEqual([
    'a|b',
    '---|---',
    'c|d',
    'after.',
  ]);
});
test('单列表格', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('| a |\n| --- |\n')).toEqual([]);
  expect(buffer.push('| c |\n')).toEqual([]);
  expect(texts(buffer.push('after.\n\n'))).toEqual([
    '| a |',
    '| --- |',
    '| c |',
    'after.',
  ]);
});
test('表格后接标题', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('| a |\n| --- |\n')).toEqual([]);
  expect(buffer.push('| c |\n')).toEqual([]);
  expect(texts(buffer.push('## 标题\n\n'))).toEqual([
    '| a |',
    '| --- |',
    '| c |',
    '标题',
  ]);
});
test('表格空行收尾', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('| a |\n| --- |\n| c |\n')).toEqual([]);
  expect(texts(buffer.push('\n'))).toEqual(['| a |', '| --- |', '| c |']);
});
test('表格 flush 收尾', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('| a |\n| --- |\n| c |')).toEqual([]);
  expect(texts(buffer.flush())).toEqual(['| a |', '| --- |', '| c |']);
});
test('竖线正文不误吞', () => {
  const buffer = new SnippetBuffer();
  const snippets = buffer.push('A | B\n正文。\n\n');

  expect(texts(snippets)).toEqual(['A | B\n正文。']);
  expect(snippets.every(snippet => snippet.kind === 'text')).toBe(true);
});
test('表头候选收尾', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('A | B\n')).toEqual([]);
  expect(texts(buffer.flush())).toEqual(['A | B']);
});
test('行内格式', () => {
  const buffer = new SnippetBuffer();

  expect(
    texts(buffer.push('**bold** and *italic* and ~~gone~~ and `code`.\n\n')),
  ).toEqual(['bold and italic and gone and code.']);
});
test('链接取文本', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('[文档](https://example.com)。\n\n'))).toEqual([
    '文档。',
  ]);
});
test('裸链接保留', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('See https://example.com。\n\n'))).toEqual([
    'See https://example.com。',
  ]);
});
test('跨行粗体等到闭合后再清理', () => {
  const buffer = new SnippetBuffer();

  expect(
    buffer.push(
      '这是前文，**加粗内容的第一句，包含逗号和句号。 加粗内容的第二句，继续写下去，超过一百个字符的长度。',
    ),
  ).toEqual([]);
  expect(buffer.push('并且在这里闭合**，后面是普通结尾。\n')).toEqual([]);

  const released = texts(buffer.push('\n'));

  expect(released.join(' ')).not.toContain('**');
  expect(released.join(' ')).toContain('这是前文');
  expect(released.join(' ')).toContain('并且在这里闭合');
});
test('同一条内闭合的粗体正常切分', () => {
  const buffer = new SnippetBuffer();
  const released = texts(
    buffer.push(`开头 **${'这是内容。'.repeat(30)}** 结尾。\n\n`),
  );

  expect(released.length).toBeGreaterThan(1);
  expect(released.join(' ')).not.toContain('**');
});
test('未闭合的内联标记在 flush 时按纯文本发出', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('开头 **没有闭合\n')).toEqual([]);

  const released = texts(buffer.flush());

  expect(released).toHaveLength(1);
  expect(released[0]).toContain('没有闭合');
});
test('行内代码里的粗体标记不当成未闭合', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('前缀 `**代码里的星号**` 后缀。\n\n'))).toEqual([
    '前缀 代码里的星号 后缀。',
  ]);
});
test('段落等到空行再清理', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('第一行 **粗体**\n')).toEqual([]);
  expect(buffer.push('第二行继续\n')).toEqual([]);
  expect(texts(buffer.push('\n'))).toEqual(['第一行 粗体\n第二行继续']);
});
test('四空格围栏被跳过', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('    ```ts\n')).toEqual([]);
  expect(buffer.push('const x = 1;\n')).toEqual([]);
  expect(buffer.push('    ```\n')).toEqual([]);
  expect(texts(buffer.push('after.\n\n'))).toEqual(['after.']);
});
test('未闭合内联在空行时按普通文本发出', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('开头 **未闭合\n')).toEqual([]);

  const released = texts(buffer.push('\n'));

  expect(released).toHaveLength(1);
  expect(released[0]).toContain('未闭合');
});
