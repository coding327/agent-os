/**
 * Agent OS 入口。
 * 当前阶段：连上飞书，收到消息原样回一句（echo bot）。
 */
import "dotenv/config";
import { startBot } from "./im/lark.js";
import { resolveMentions } from "./im/message-parser.js";

const appId = process.env.BOT_A_APP_ID;
const appSecret = process.env.BOT_A_APP_SECRET;

if (!appId || !appSecret) {
  console.error("缺少 BOT_A_APP_ID / BOT_A_APP_SECRET，请检查 .env");
  process.exit(1);
}

console.log("Agent OS 启动，正在建立飞书长连接…");

startBot({
  appId,
  appSecret,
  onMessage: async (msg, bot) => {
    const hasThread = !!msg.threadId || !!msg.rootId; // 是否在话题中

    const resolved = resolveMentions(msg.text, msg.mentions);
    console.log(` 原文: ${msg.text}`);
    console.log(` 还原: ${resolved}`);
    console.log(
      ` mentions: ${msg.mentions.map((m) => `${m.key}=${m.name}(${m.openId})`).join(", ") || "(无)"}`,
    )

    // 原样回一句
    const replyId = await bot.reply(msg.messageId, `收到: ${resolved}`, hasThread);
  },
});
