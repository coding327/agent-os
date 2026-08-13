export interface Mention {
  key: string; // '@_user_1'
  name: string; // 显示名，如 'MyBot'
  openId: string; // 'ou_xxx'
}

/** 从事件的 mentions 数组中提取结构化提及信息。 */
export function parseMentions(raw: any[] | undefined): Mention[] {
  if (!raw?.length) return [];
  return raw.map((m) => ({
    key: m.key,
    name: m.name ?? "",
    openId: m.id?.open_id ?? "",
  }));
}

/**
 * 把 @_user_N 占位符替换成 @显示名；并剔除机器人自身的提及。
 * selfOpenId 匹配到机器人自己时，去掉占位符，只留下真正的任务文本。
 */
export function resolveMentions(
  text: string,
  mentions: Mention[],
  selfOpenId?: string,
): string {
  let resolved = text;
  for (const m of mentions) {
    if (selfOpenId && m.openId === selfOpenId) {
      resolved = resolved.replaceAll(m.key, "");
      continue;
    }
    resolved = resolved.replaceAll(m.key, `@${m.name}`);
  }
  return resolved.trim();
}

/** 从消息 content 中提取资源 key（image_key / file_key）。 */
export function extractResourceKeys(
  messageType: string,
  content: string,
): { type: "image" | "file"; key: string; fileName?: string }[] {
  const parsed = JSON.parse(content);
  const resources: {
    type: "image" | "file";
    key: string;
    fileName?: string;
  }[] = [];

  if (messageType === "image" && parsed.image_key) {
    resources.push({ type: "image", key: parsed.image_key });
  }
  if (messageType === "file" && parsed.file_key) {
    resources.push({
      type: "file",
      key: parsed.file_key,
      fileName: parsed.file_name,
    });
  }
  if (messageType === "post") {
    const paragraphs: any[][] = parsed.content ?? [];
    for (const el of paragraphs.flat()) {
      if (el.tag === "img" && el.image_key) {
        resources.push({ type: "image", key: el.image_key });
      }
    }
  }

  return resources;
}
