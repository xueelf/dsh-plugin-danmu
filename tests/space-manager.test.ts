import { expect, test } from 'bun:test';
import {
  type PlacementRequest,
  DEFAULT_DURATION,
  OFFSET_TOP,
  SpaceManager,
  tz,
} from '#/danmu/space-manager';

/**
 * 下面的布局使用一组常见尺寸：层宽 1000 到 1500px，显示区域 50%，
 * 高度取实测值。运动参数来自 B 站网页端的 tz() 与碰撞检查公式。
 */
const request = (
  width: number,
  height: number,
  now: number,
  overrides: Partial<PlacementRequest> = {},
): PlacementRequest => ({
  width,
  height,
  now,
  containerWidth: 1000,
  containerHeight: 700,
  area: 50,
  ...overrides,
});
const SMALL_LAYER = { containerWidth: 500, containerHeight: 500 };

test('穿越时长按分段表计算', () => {
  expect(tz(500, 100)).toBe(DEFAULT_DURATION);
  expect(tz(0, 100)).toBe(DEFAULT_DURATION);
  expect(tz(1000, 100)).toBeCloseTo(8.098, 3);
  // 超过 2560 时，每 500px 上下限各加一秒。
  expect(tz(3100, 200)).toBeCloseTo(17.097, 3);
});
test('首条弹幕的运动参数', () => {
  const placement = new SpaceManager().add(request(100, 30, 0));

  expect(placement?.y).toBe(OFFSET_TOP);
  // 起点为 ceil(1000 + 1) + 50，总移动距离再加上自身宽度与 50px 安全边距。
  expect(placement?.x).toBe(1051);
  expect(placement?.translateX).toBe(-1201);
  expect(placement?.duration).toBe(8.85);
});
test('速度倍率只影响后续弹幕', () => {
  const allocator = new SpaceManager();
  const first = allocator.add(request(100, 30, 0));

  expect(first?.duration).toBe(8.85);
  allocator.setSpeedPlus(2);

  const second = allocator.add(request(100, 30, 0));

  expect(second?.duration).toBeCloseTo(4.43, 2);
  expect(first?.duration).toBe(8.85);
});
test('按实测高度排列', () => {
  const allocator = new SpaceManager();

  expect(allocator.add(request(100, 30, 0))?.y).toBe(OFFSET_TOP);
  expect(allocator.add(request(100, 30, 0))?.y).toBe(OFFSET_TOP + 31);
  expect(allocator.add(request(100, 30, 0))?.y).toBe(OFFSET_TOP + 62);
});
test('显示区域限制排列高度', () => {
  // 层高 500、显示区域 50 时可用高度为 250.5，两行 100px 放得下，第三行放不下。
  const allocator = new SpaceManager();
  const overrides = { containerWidth: 500, containerHeight: 500 };

  expect(allocator.add(request(100, 100, 0, overrides))?.y).toBe(OFFSET_TOP);
  expect(allocator.add(request(100, 100, 0, overrides))?.y).toBe(
    OFFSET_TOP + 101,
  );
  expect(allocator.add(request(100, 100, 0, overrides))).toBeNull();
});
test('空层放置超高弹幕', () => {
  /**
   * 轨道列表为空时，add() 先返回顶部槽位，再检查上限，
   * 所以过高的首条弹幕仍会被放置并裁切。
   */
  expect(
    new SpaceManager().add(request(100, 30, 0, { containerHeight: 20 }))?.y,
  ).toBe(OFFSET_TOP);
});
test('追不上时共用轨道', () => {
  const allocator = new SpaceManager();

  expect(allocator.add(request(100, 30, 0, SMALL_LAYER))?.y).toBe(OFFSET_TOP);
  expect(allocator.add(request(100, 30, 2, SMALL_LAYER))?.y).toBe(OFFSET_TOP);
});
test('弹幕离开后释放轨道', () => {
  const allocator = new SpaceManager();

  expect(allocator.add(request(100, 30, 0, SMALL_LAYER))?.y).toBe(OFFSET_TOP);
  expect(allocator.add(request(100, 30, 6, SMALL_LAYER))?.y).toBe(OFFSET_TOP);
});
test('释放的顶部轨道只复用一次', () => {
  const allocator = new SpaceManager();
  const base: PlacementRequest = {
    width: 2000,
    height: 30,
    now: 0,
    containerWidth: 1500,
    containerHeight: 700,
    area: 50,
  };

  // 宽弹幕速度更快，先离开画面，窄弹幕随后离开。
  expect(allocator.add(base)?.y).toBe(OFFSET_TOP);
  expect(allocator.add({ ...base, width: 10 })?.y).toBe(OFFSET_TOP + 31);
  /**
   * 宽弹幕离开、窄弹幕仍在滚动时，
   * 下一条会占用空出来的顶部轨道。
   */
  expect(allocator.add({ ...base, width: 100, now: 11.6 })?.y).toBe(OFFSET_TOP);
  expect(allocator.add({ ...base, width: 100, now: 11.6 })?.y).toBeGreaterThan(
    OFFSET_TOP,
  );
});
