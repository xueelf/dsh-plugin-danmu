import { expect, test } from 'bun:test';
import { type SizeScale, getLen, textSize } from '#/danmu/text';

const scale: SizeScale = { fullAngle: 1, number: 1 };
const measure = () => ({ height: 45, width: 123 });

test('ASCII 字符宽度', () => {
  expect(getLen('2', scale)).toBeCloseTo(0.6, 6);
  expect(getLen('3', scale)).toBeCloseTo(0.6, 6);
  expect(getLen('-', scale)).toBeCloseTo(0.7, 6);
  expect(getLen('(', scale)).toBeCloseTo(0.4, 6);
});
test('全角与半角宽度', () => {
  expect(getLen('哔', scale)).toBe(1);
  expect(getLen('哩', scale)).toBe(1);
  expect(getLen('ﾋﾞ', scale)).toBe(1);
  expect(getLen('ﾘ', scale)).toBeCloseTo(0.5, 6);
});
test('表外字符改测元素宽度', () => {
  expect(getLen('bilibili', scale)).toBe(0);
  expect(getLen('哔哩哔哩bilibili', scale)).toBe(0);
  expect(getLen('📺', scale)).toBe(0);
  expect(textSize('bilibili', 25, scale, measure)).toEqual({
    height: 45,
    width: 123,
  });
});
test('字符范围边界', () => {
  expect(getLen(String.fromCodePoint(31), scale)).toBe(0);
  expect(getLen(String.fromCodePoint(32), scale)).toBeCloseTo(0.5, 6);
  expect(getLen(String.fromCodePoint(64), scale)).toBeCloseTo(0.95, 6);
  expect(getLen(String.fromCodePoint(65), scale)).toBe(0);
  expect(getLen(String.fromCodePoint(8192), scale)).toBe(1);
  expect(getLen(String.fromCodePoint(10175), scale)).toBe(1);
  expect(getLen(String.fromCodePoint(10176), scale)).toBe(0);
  expect(getLen(String.fromCodePoint(65376), scale)).toBe(1);
  expect(getLen(String.fromCodePoint(65377), scale)).toBeCloseTo(0.5, 6);
  expect(getLen(String.fromCodePoint(65470), scale)).toBeCloseTo(0.5, 6);
  expect(getLen(String.fromCodePoint(65471), scale)).toBe(1);
  expect(getLen(String.fromCodePoint(65518), scale)).toBeCloseTo(0.5, 6);
  expect(getLen(String.fromCodePoint(65519), scale)).toBe(1);
  expect(getLen(String.fromCodePoint(65520), scale)).toBe(0);
});
test('文本尺寸估算', () => {
  // 哔哩哔哩：4 个全角字符，宽度 1.02 * ceil(100)，高度 ceil(1.125 * 25)。
  expect(textSize('哔哩哔哩', 25, scale, measure)).toEqual({
    height: 29,
    width: 102,
  });
  expect(getLen('2', { fullAngle: 3, number: 2 })).toBeCloseTo(1.2, 6);
});
