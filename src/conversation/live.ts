/**
 * Client 实时 reasoning chunk 的整理。
 *
 * 已落盘的转写由 Host session projection 完成，
 * 这里只处理瞬时 `assistant/live-chunk`，不折叠 session events。
 */

import {
  type LiveChunkLike,
  type SessionChangeLike,
  type TextData,
  Mode,
  readRecord,
  readString,
} from './decoder';
import { type Snippet, SnippetBuffer } from './snippet';

/**
 * 把流式 reasoning 整理成整行弹幕。
 *
 * `change` 只消费 transient 条目，committed 条目由 Host projection 产生。
 */
export class LiveDanmuDecoder {
  private readonly snippets = new SnippetBuffer();

  /** 清空跨会话的流式状态。 */
  reset(): void {
    this.snippets.reset();
  }

  /** 消费一次会话窗口变化，只返回 transient 产生的弹幕。 */
  change(change: SessionChangeLike): TextData[] {
    if (change.kind === 'replace') {
      this.reset();

      return [];
    }

    if (change.kind !== 'append') {
      return [];
    }
    const released: TextData[] = [];

    for (const entry of change.entries) {
      if (entry.type === 'transient') {
        released.push(...this.live(entry.event));
      }
    }
    return released;
  }

  /** 把当前未闭合的 reasoning 片段收尾。 */
  flush(): TextData[] {
    return this.emitSnippets(this.snippets.flush());
  }

  private live(event: LiveChunkLike): TextData[] {
    if (event.type !== 'assistant/live-chunk') {
      return [];
    }
    const data = readRecord(event.data);

    if (data === null) {
      return [];
    }
    const chunk = readRecord(data.chunk);

    if (chunk === null) {
      return [];
    }
    const text = readString(chunk.text);

    if (chunk.type === 'reasoning-delta' && text !== null) {
      return this.emitSnippets(this.snippets.push(text));
    }

    if (chunk.type === 'block-end') {
      const block = readRecord(chunk.block);

      if (readString(block?.type) === 'reasoning') {
        return this.emitSnippets(this.snippets.flush());
      }
    }
    return [];
  }

  private emitSnippets(snippets: readonly Snippet[]): TextData[] {
    return snippets.map(snippet => ({
      mode: snippet.kind === 'table' ? Mode.Top : Mode.Roll,
      text: snippet.text,
    }));
  }
}
