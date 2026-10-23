import { expect, test } from 'bun:test';
import { gapCompensation } from '#/danmu/probe';

test('按 flex 主方向把标记点多占的 gap 平分到两侧', () => {
  expect(gapCompensation(8, 'row')).toEqual({ marginInline: -4 });
  expect(gapCompensation(6, 'column')).toEqual({ marginBlock: -3 });
});
test('反向 flex 仍按主轴方向补偿', () => {
  expect(gapCompensation(8, 'row-reverse')).toEqual({ marginInline: -4 });
  expect(gapCompensation(6, 'column-reverse')).toEqual({ marginBlock: -3 });
});
test('没有 gap 时不补偿', () => {
  expect(gapCompensation(0, 'row')).toBeNull();
  expect(gapCompensation(Number.NaN, 'column')).toBeNull();
});
