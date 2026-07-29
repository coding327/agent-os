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

/** 把 @_user_N 占位符替换成 @显示名。 */
export function resolveMentions(text: string, mentions: Mention[]): string {
  let resolved = text;
  for (const m of mentions) {
    resolved = resolved.replaceAll(m.key, `@${m.name}`);
  }
  return resolved.trim();
}
