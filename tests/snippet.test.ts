import { expect, test } from 'bun:test';
import { type Snippet, SnippetBuffer } from '#/danmu/snippet';

function texts(snippets: readonly Snippet[]): string[] {
  return snippets.map(snippet => snippet.text);
}

test('半行不处理', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('没有换行')).toEqual([]);
  expect(buffer.push('，继续')).toEqual([]);
  expect(texts(buffer.push('\n'))).toEqual(['没有换行，继续']);
  expect(buffer.flush()).toEqual([]);
});
test('整行一条', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('# 什么？！你居然写了一个弹幕插件？\n'))).toEqual([
    '什么？！你居然写了一个弹幕插件？',
  ]);
});
test('超长才切', () => {
  const buffer = new SnippetBuffer();
  const released = texts(buffer.push(`${'第一句。'.repeat(30)}\n`));

  expect(released).toHaveLength(30);
  expect(new Set(released)).toEqual(new Set(['第一句。']));
});
test('长单句不截断', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push(`${'x'.repeat(150)}\n`))).toEqual(['x'.repeat(150)]);
});
test('单句一行', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('The allocator picks a lane.\n'))).toEqual([
    'The allocator picks a lane.',
  ]);
});
test('多行逐条', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('第一行。\n第二行。\n'))).toEqual([
    '第一行。',
    '第二行。',
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

  expect(texts(buffer.push('用时  3  秒\n'))).toEqual(['用时  3  秒']);
  expect(texts(buffer.push('  用时 3 秒  \n'))).toEqual(['  用时 3 秒  ']);
});
test('列表逐行', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('- 第一项\n- 第二项\n'))).toEqual([
    '第一项',
    '第二项',
  ]);
});
test('代码块跳过', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('before.\n```js\nconst'))).toEqual(['before.']);
  expect(buffer.push(' x = 1;\n')).toEqual([]);
  expect(texts(buffer.push('```\nafter.\n'))).toEqual(['after.']);
});
test('未闭合代码块', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('```js\ncode')).toEqual([]);
  expect(texts(buffer.flush())).toEqual(['`js', 'code']);
});
test('单反引号不是围栏', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('`\ncontent\n'))).toEqual(['`', 'content']);
});
test('四反引号不是围栏', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('````md\ncontent\n'))).toEqual(['``md', 'content']);
});
test('表格整段同步', () => {
  const buffer = new SnippetBuffer();

  expect(buffer.push('| a | b |\n| --- | --- |\n')).toEqual([]);
  expect(buffer.push('| c | d |\n')).toEqual([]);

  const snippets = buffer.push('after.\n');

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
  expect(texts(buffer.push('after.\n'))).toEqual([
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
  expect(texts(buffer.push('after.\n'))).toEqual([
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
  expect(texts(buffer.push('after.\n'))).toEqual([
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
  expect(texts(buffer.push('## 标题\n'))).toEqual([
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
  const snippets = buffer.push('A | B\n正文。\n');

  expect(texts(snippets)).toEqual(['A | B', '正文。']);
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
    texts(buffer.push('**bold** and *italic* and ~~gone~~ and `code`.\n')),
  ).toEqual(['bold and italic and gone and code.']);
});
test('链接取文本', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('[文档](https://example.com)。\n'))).toEqual([
    '文档。',
  ]);
});
test('裸链接保留', () => {
  const buffer = new SnippetBuffer();

  expect(texts(buffer.push('See https://example.com。\n'))).toEqual([
    'See https://example.com。',
  ]);
});
