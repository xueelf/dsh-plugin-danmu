import { expect, test } from 'bun:test';
import { getFontSize, MIN_FONT_SIZE, REFERENCE_SIZE } from '#/danmu/font';

/** 以 B 站网页端的 `getFontSize` 计算，字号 25、倍率 1。 */
const size = (height: number) => getFontSize(REFERENCE_SIZE, height, 1);

test('字号按容器高度换算', () => {
  expect(size(200)).toBe(16);
  expect(size(400)).toBeCloseTo(0.0385 * 400 + 3.29, 6);
  expect(size(600)).toBeCloseTo(0.041 * 600, 6);
  expect(size(800)).toBe(27);
  expect(size(900)).toBeCloseTo(0.0365 * 900 - 2.5, 6);
  expect(size(1108)).toBeCloseTo(0.022 * 1108 + 18.5, 6);
  expect(size(1400)).toBe(40);
});
test('字号倍率', () => {
  expect(getFontSize(REFERENCE_SIZE, 1108, 2)).toBeCloseTo(size(1108) * 2, 6);
});
test('关闭随屏缩放', () => {
  expect(getFontSize(25, 1108, 1, false)).toBe(25);
  expect(getFontSize(25, 400, 1, false)).toBe(25);
});
test('最小字号', () => {
  expect(getFontSize(1, 800, 1)).toBe(MIN_FONT_SIZE);
  // B 站网页端先把结果提升到最小 12，只有结果仍为 NaN 时才回落到 25。
  expect(getFontSize(0, 800, 1)).toBe(MIN_FONT_SIZE);
});
test('首个分段以下的字号', () => {
  expect(getFontSize(25, 0, 1)).toBe(16);
  expect(getFontSize(25, 314, 1)).toBe(16);
});
