/**
 * `dsh-plugin-danmu` 的宿主入口。
 *
 * 已落盘会话事件在这里注册为 session projection，
 * Client 只消费投影和实时 reasoning chunk。
 */

import { danmuProjectionDefinition } from './conversation/projection';

interface SessionProjections {
  register(definition: unknown): () => void;
}

interface HostContext {
  sessionProjections: SessionProjections;
  effect(callback: () => () => void, label?: string): () => void;
}

export const inject = ['sessionProjections'];

export function apply(ctx: HostContext): void {
  ctx.effect(
    () => ctx.sessionProjections.register(danmuProjectionDefinition),
    'danmu: projection',
  );
}
