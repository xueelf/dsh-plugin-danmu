import { expect, test } from 'bun:test';
import { type ConversationBox, bandRect, pickColumnSpan } from '#/danmu/region';

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
  const band = bandRect(box(-50, 0, 0, 0), origin);

  expect(band).toEqual({ left: -50, top: 0, width: 0, height: 0 });
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

/**
 * 实际页面中从输入框标记点向上测得的祖先元素链。
 * `display: contents` 的槽位包装层会返回全零矩形，
 * 位于真正参与栏布局的盒子之间。
 */
const MEASURED_CHAIN = [
  { left: 0, width: 0 },
  { left: 281, width: 1494 },
  { left: 0, width: 0 },
  { left: 0, width: 0 },
  { left: 281, width: 1494 },
  { left: 281, width: 1499 },
  { left: 281, width: 1501 },
  { left: 281, width: 1501 },
  { left: 0, width: 0 },
  { left: 0, width: 1782 },
];

test('无盒子的包装层', () => {
  const span = pickColumnSpan({ left: 281, width: 1494 }, MEASURED_CHAIN);

  expect(span).toEqual({ left: 281, width: 1501 });
  expect(span.left + span.width).toBe(1782);
});
test('侧栏边界', () => {
  const span = pickColumnSpan({ left: 281, width: 1494 }, [
    { left: 0, width: 1782 },
  ]);

  expect(span).toEqual({ left: 281, width: 1494 });
});
test('标记点比祖先更宽', () => {
  const span = pickColumnSpan({ left: 281, width: 1501 }, [
    { left: 281, width: 1494 },
  ]);

  expect(span).toEqual({ left: 281, width: 1501 });
});
