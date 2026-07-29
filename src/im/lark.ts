/**
 * 飞书接入：WS 长连接收消息 + REST 回消息。
 */
import * as Lark from "@larksuiteoapi/node-sdk";

import { parseMentions, type Mention } from "./message-parser.js";

export interface IncomingMessage {
  messageId: string;
  chatId: string;
  chatType: string; // 'p2p' 单聊 | 'group' 群聊
  messageType: string; // 'text' | 'image' | 'post' | ...
  text: string; // text 消息的正文（其他类型为空串）
  senderOpenId: string;
  rootId: string;
  threadId: string;
  mentions: Mention[];
}

export interface BotOptions {
  appId: string;
  appSecret: string;
  onMessage: (msg: IncomingMessage, bot: Bot) => Promise<void>;
}

export interface Bot {
  client: Lark.Client;
  reply: (
    messageId: string,
    text: string,
    replyInThread?: boolean,
  ) => Promise<string | undefined>;
}

function extractText(messageType: string, content: string): string {
  const parsed = JSON.parse(content);
  if (messageType === "text") {
    return parsed.text ?? "";
  }
  if (messageType === "post") {
    const paragraphs: any[][] = parsed.content ?? [];
    return paragraphs
      .flat()
      .filter((el) => el.tag === "text")
      .map((el) => el.text)
      .join("")
      .trim();
  }
  return "";
}

export function startBot(opts: BotOptions): Bot {
  const { appId, appSecret, onMessage } = opts;

  const client = new Lark.Client({ appId, appSecret });

  const bot: Bot = {
    client,
    async reply(messageId, text, replyInThread = false) {
      const res = await client.im.v1.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: "text",
          content: JSON.stringify({ text }),
          ...(replyInThread ? { reply_in_thread: true } : {}),
        },
      });
      return res.data?.message_id;
    },
  };

  const dispatcher = new Lark.EventDispatcher({}).register({
    "im.message.receive_v1": async (data: any) => {
      const m = data.message;
      const msg: IncomingMessage = {
        messageId: m.message_id,
        chatId: m.chat_id,
        chatType: m.chat_type,
        messageType: m.message_type,
        text: extractText(m.message_type, m.content),
        senderOpenId: data.sender.sender_id?.open_id ?? "",
        rootId: m.root_id ?? "",
        threadId: m.thread_id ?? "",
        mentions: parseMentions(m.mentions),
      };
      await onMessage(msg, bot);
    },
  });

  const wsClient = new Lark.WSClient({ appId, appSecret });
  wsClient.start({ eventDispatcher: dispatcher });

  return bot;
}
