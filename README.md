# dsh-plugin-danmu

Real-time danmu for DeepSeek Harness (dsh). It inserts text such as the agent's reasoning, tool calls and task progress into the conversation area as scrolling text.

Read this in other languages: English | [简体中文](./README.zh.md)

## What is danmu?

Danmu (弹幕) is an interactive mechanism on websites. It first appeared on [ニコニコ動画](https://www.nicovideo.jp) (hereafter NicoNico), where users could display the comments they sent as scrolling subtitles over the page. The mechanism later spread widely in China through [哔哩哔哩](https://www.bilibili.com) (hereafter bilibili), and you can now find it on many video platforms.

Notably, the word "弹幕" was originally the Japanese military term "弾幕" (だんまく), commonly translated as "barrage". It refers to a firing method that does not aim precisely and covers the target with a large number of projectiles.

As the Chinese internet developed, the word "弹幕" in Chinese has generally come to refer to video danmu, and the distinct term danmu was born from it. The Chinese "弹幕" (danmu) and the Japanese "弾幕" (danmaku) do not have the same meaning, and NicoNico has always called its comments "コメント" (comment).

This project therefore uses danmu as its name, rather than the Japanese romanisation danmaku.

## Installation

You can install it from the dsh plugin manager by entering `dsh-plugin-danmu`. Once installed, the plugin appears in the list as Agent Danmu.

## Usage

Once the plugin is installed and enabled, the active danmu region follows the current session and danmu are emitted automatically when the agent starts producing output.

Danmu are drawn only inside the conversation content area. They do not cover the session list on the left, the sidebar on the right or the header. The composer and the status bar also sit inside the active region, so danmu pass over them briefly, just like the controls inside the bilibili video frame. The whole layer is click-through, so selecting text or clicking buttons is unaffected.

The behaviour matches the bilibili web player in speed, font size, row assignment and how it handles a full content area.

To turn it off, disable the plugin in the plugin manager.

## FAQ

| Question                    | Answer                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No danmu appears            | Text only appears while you are talking to the agent. If you see none, it proves the whale is not thinking.                                                             |
| Some danmu are missing      | When the content area runs out of room, the text is dropped, the same as bilibili                                                                                       |
| Why are some danmu so long  | bilibili limits each danmu to 100 characters, this project does not. Long lines are split at sentence boundaries, but a single long sentence or a table row stays whole |
| White text in a light theme | The same style as bilibili, where a black outline keeps it readable                                                                                                     |
| Does it show emoji          | Yes. bilibili filters emoji from danmu, this project does not                                                                                                           |
| Can I change speed or size  | Not yet implemented, see the [Roadmap](#roadmap)                                                                                                                        |

## Icon

The "弹" glyph in the icon is taken from [Lolita](https://www.fonts.net.cn/font-33402852359.html), a free typeface for non-commercial use. The typeface remains under its own licence. The icon is coloured with DeepSeek's theme blue #4D6BFE.

## Roadmap

- [x] Scrolling danmu: speed, font size and row assignment match the bilibili web player
- [x] Top danmu: round, step, retry and compaction notices sit centred at the top of the region
- [x] emoji: shown as is
- [ ] Settings panel: speed, font size, opacity and display area
- [ ] Coloured danmu: colour by kind or source
- [ ] Advanced danmu: images and animation
