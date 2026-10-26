import { expect, test } from 'bun:test';
import { bottomOffset, CenterAllocator } from '#/danmu/center';

const request = (now: number, height = 30) => ({
  height,
  now,
  containerHeight: 500,
  area: 50,
});

test('顶部逐行排列', () => {
  const allocator = new CenterAllocator();

  expect(allocator.add(request(0))).toBe(4);
  expect(allocator.add(request(0))).toBe(35);
});
test('过期行复用', () => {
  const allocator = new CenterAllocator();

  expect(allocator.add(request(0))).toBe(4);
  expect(allocator.add(request(5))).toBe(4);
});
test('显示区域放不下', () => {
  const allocator = new CenterAllocator();

  expect(allocator.add({ ...request(0), area: 5 })).toBeNull();
});
test('堆叠超出显示区域', () => {
  const allocator = new CenterAllocator();

  expect(allocator.add({ ...request(0), area: 10 })).toBe(4);
  expect(allocator.add({ ...request(0), area: 10 })).toBeNull();
});
test('单条高于整层', () => {
  const allocator = new CenterAllocator();

  expect(allocator.add({ ...request(0), height: 501 })).toBeNull();
});
test('底部弹幕翻转到容器底部', () => {
  expect(bottomOffset(500, 30, 4)).toBe(466);
  expect(bottomOffset(500, 100, 105)).toBe(295);
});
test('显示区域为 0 时启用三层重叠', () => {
  const allocator = new CenterAllocator();
  const base = { height: 100, now: 0, containerHeight: 500, area: 0 };

  // 每层放四条，第五条从第二层的顶部重新开始。
  expect(allocator.add(base)).toBe(4);
  expect(allocator.add(base)).toBe(105);
  expect(allocator.add(base)).toBe(206);
  expect(allocator.add(base)).toBe(307);
  expect(allocator.add(base)).toBe(4);
  expect(allocator.add(base)).toBe(105);
  expect(allocator.add(base)).toBe(206);
  expect(allocator.add(base)).toBe(307);
  expect(allocator.add(base)).toBe(4);
  expect(allocator.add(base)).toBe(105);
  expect(allocator.add(base)).toBe(206);
  expect(allocator.add(base)).toBe(307);
  expect(allocator.add(base)).toBeNull();
});
