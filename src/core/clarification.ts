import { z } from "zod";

const OptionSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9_-]{1,32}$/)
    .describe("选项标识符（如 option_1, opt_a）"),
  label: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe("选项展示文本（简明清晰的文字描述）"),
});

const QuestionSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9_-]{1,32}$/)
      .describe("问题标识符（如 q1, question_1）"),
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .describe("向用户提问的具体问题描述"),
    options: z
      .array(OptionSchema)
      .min(2)
      .max(4)
      .describe("该问题的备选选项列表（2 到 4 个）"),
    recommendedOptionId: z
      .string()
      .regex(/^[a-z0-9_-]{1,32}$/)
      .optional()
      .describe("推荐选项的 id（必须存在于 options 中）"),
  })
  .superRefine((question, ctx) => {
    const optionIds = question.options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "同一道问题的选项 ID 不能重复",
        path: ["options"],
      });
    }
    if (
      question.recommendedOptionId &&
      !optionIds.includes(question.recommendedOptionId)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "推荐项必须指向当前问题中的选项",
        path: ["recommendedOptionId"],
      });
    }
  });

export const ClarificationRequestSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .default("需求澄清")
      .describe("需求澄清卡片的标题"),
    intro: z
      .string()
      .trim()
      .max(300)
      .optional()
      .default("")
      .describe("澄清背景说明与简述"),
    questions: z
      .array(QuestionSchema)
      .min(1)
      .max(5)
      .describe("需要用户选择的结构化问题列表（1 到 5 个）"),
  })
  .superRefine((request, ctx) => {
    const questionIds = request.questions.map((question) => question.id);
    if (new Set(questionIds).size !== questionIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "同一份澄清请求的问题 ID 不能重复",
        path: ["questions"],
      });
    }
  });

export type ClarificationRequest = z.infer<typeof ClarificationRequestSchema>;

export function extractClarificationFromText(
  text: string,
): ClarificationRequest | undefined {
  if (!text || typeof text !== "string") return undefined;

  // 0. 优先尝试提取嵌入的 JSON 结构
  const jsonBlocks = [
    ...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi),
  ];
  for (const match of jsonBlocks) {
    try {
      const obj = JSON.parse(match[1]);
      const parsed = ClarificationRequestSchema.safeParse(obj);
      if (parsed.success) return parsed.data;
    } catch {
      // continue
    }
  }

  const rawJsonMatch = text.match(/(\{[\s\S]*"questions"[\s\S]*\})/);
  if (rawJsonMatch) {
    try {
      const obj = JSON.parse(rawJsonMatch[1]);
      const parsed = ClarificationRequestSchema.safeParse(obj);
      if (parsed.success) return parsed.data;
    } catch {
      // continue
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. 提取标题
  let title = "需求澄清";
  for (const line of lines) {
    if (
      line.startsWith("#") ||
      line.startsWith("【") ||
      (line.startsWith("**") &&
        line.endsWith("**") &&
        line.length < 50 &&
        !line.includes("？") &&
        !line.includes("?"))
    ) {
      const cleaned = line.replace(/^[#*【\s]+|[#*】\s]+$/g, "").trim();
      if (
        cleaned.length >= 2 &&
        cleaned.length <= 80 &&
        !cleaned.includes("选项") &&
        !cleaned.includes("问题")
      ) {
        title = cleaned;
        break;
      }
    }
  }

  // 2. 提取问题描述 (prompt)
  let promptText = "";
  for (const line of lines) {
    if (line.includes("？") || line.includes("?")) {
      const qLine = line.replace(/^[#*\s\-—]+|[#*\s]+$/g, "").trim();
      if (qLine.length >= 4 && qLine.length <= 300 && !qLine.includes("选项")) {
        promptText = qLine;
        break;
      }
    }
    const pMatch = line.match(
      /(?:(?:^|\*\*|\b)(?:问题|请问|提问)[：:]\s*(?:\*\*)?|^[#*]*\s*(?:请确认|为了|针对)[^\n]*[？?：:])\s*(.+)/,
    );
    if (pMatch) {
      promptText = pMatch[1].replace(/^[*\s]+|[*\s]+$/g, "").trim();
      break;
    }
  }

  // 3. 提取选项列表
  const options: Array<{ id: string; label: string }> = [];
  let recommendedOptionId: string | undefined;

  for (const line of lines) {
    const optMatch = line.match(
      /^(?:[-*+]\s+)?(?:\*\*)?(?:选项\s*)?([A-Za-z0-9一二三四1-4])(?:[^\w\s一-龥]*?(?:推荐)[^\w\s一-龥]*?)?[*.、:：—\-\s)]+[\s*]*(.+)$/i,
    );

    if (optMatch) {
      const rawKey = optMatch[1];
      const keyMap: Record<string, string> = {
        一: "1",
        二: "2",
        三: "3",
        四: "4",
      };
      const normalizedKey = (keyMap[rawKey] || rawKey).toLowerCase();
      const id = `opt_${normalizedKey}`;

      if (options.some((o) => o.id === id)) continue;

      let label = optMatch[2]
        .replace(/\*\*/g, "")
        .replace(/^[：:—\-\s]+/, "")
        .trim();

      const isRecommended = line.includes("推荐");
      if (isRecommended && !recommendedOptionId) {
        recommendedOptionId = id;
      }

      label = label.replace(/[（(]推荐[）)]/g, "").trim();

      if (label.length >= 1) {
        options.push({
          id,
          label: label.slice(0, 100),
        });
      }
    }
  }

  if (options.length < 2 || options.length > 4) {
    return undefined;
  }

  if (!promptText) {
    promptText = title;
  }

  if (
    recommendedOptionId &&
    !options.some((o) => o.id === recommendedOptionId)
  ) {
    recommendedOptionId = undefined;
  }

  const candidate = {
    title: title.slice(0, 80),
    intro: "",
    questions: [
      {
        id: "q1",
        prompt: promptText.slice(0, 300),
        options,
        ...(recommendedOptionId ? { recommendedOptionId } : {}),
      },
    ],
  };

  const parsed = ClarificationRequestSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

export function findClarificationRequest(
  toolCalls: Array<{ toolName: string; input: unknown }> | undefined,
  fallbackText?: string,
): ClarificationRequest | undefined {
  for (let index = (toolCalls?.length ?? 0) - 1; index >= 0; index -= 1) {
    const call = toolCalls?.[index];
    if (call?.toolName !== "request_clarification") continue;
    let input = call.input;
    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch {
        // keep raw
      }
    }
    const parsed = ClarificationRequestSchema.safeParse(input);
    if (parsed.success) return parsed.data;
  }
  if (fallbackText) {
    return extractClarificationFromText(fallbackText);
  }
  return undefined;
}
