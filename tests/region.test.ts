import { expect, test } from 'bun:test';
import {
  type ConversationBox,
  bandRect,
  firstMeasuredCommonIndex,
  headerBottomBelow,
} from '#/danmu/region';

const box = (
  left: number,
  width: number,
  top: number,
  bottom: number,
): ConversationBox => ({ left, width, top, bottom });
const origin = { left: 0, top: 0 };

test('内容区映射', () => {
  expect(bandRect(box(280, 1700, 85, 1190), origin)).toEqual({
    left: 280,
    top: 85,
    width: 1700,
    height: 1105,
  });
});
test('层原点坐标', () => {
  const band = bandRect(box(280, 1700, 85, 1190), { left: 10, top: 20 });

  expect(band).toEqual({ left: 270, top: 65, width: 1700, height: 1105 });
});
test('未布局的弹幕带', () => {
  expect(bandRect(box(-50, 0, 0, 0), origin)).toEqual({
    left: -50,
    top: 0,
    width: 0,
    height: 0,
  });
});
test('折叠区域的高度', () => {
  const band = bandRect(box(0, 800, 400, 400), origin);

  expect(band.height).toBe(0);
  expect(band.top).toBe(400);
});
test('层原点以上的区域', () => {
  const band = bandRect(box(0, 800, -60, 300), origin);

  expect(band.top).toBe(0);
  expect(band.height).toBe(300);
});
test('标记点的第一个有尺寸公共祖先', () => {
  const top = ['utilities', 'header', 'root', 'frame'];
  const bottom = new Set(['dock', 'body', 'root', 'frame']);
  const boxes = [
    { width: 0, height: 0 },
    { width: 1501, height: 76 },
    { width: 1501, height: 1000 },
    { width: 1782, height: 1000 },
  ];

  expect(firstMeasuredCommonIndex(top, bottom, boxes)).toBe(2);
});
test('跳过 display contents 的零尺寸公共祖先', () => {
  const top = ['utilities', 'root', 'session-root', 'frame'];
  const bottom = new Set(['dock', 'root', 'session-root', 'frame']);
  const boxes = [
    { width: 0, height: 0 },
    { width: 1501, height: 0 },
    { width: 1501, height: 1000 },
    { width: 1782, height: 1000 },
  ];

  expect(firstMeasuredCommonIndex(top, bottom, boxes)).toBe(2);
});
test('没有公共祖先', () => {
  const top = ['utilities', 'header'];
  const bottom = new Set(['dock', 'body']);
  const boxes = [
    { width: 1501, height: 76 },
    { width: 1501, height: 76 },
  ];

  expect(firstMeasuredCommonIndex(top, bottom, boxes)).toBe(-1);
});
test('头部下边缘取祖先最大 bottom', () => {
  expect(headerBottomBelow(80, [90, 120, 100])).toBe(120);
  expect(headerBottomBelow(95, [])).toBe(95);
});
