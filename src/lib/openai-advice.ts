import {
  aiAdviceSchema,
  snapshotForAi,
  type AiAdviceResult,
  type ClassicAdviceResult,
  type FinancialSnapshot
} from "./advice";

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "recommendations", "caveats"],
  properties: {
    summary: { type: "string" },
    recommendations: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "priority",
          "category",
          "title",
          "rationale",
          "action",
          "monthlyImpact"
        ],
        properties: {
          id: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          category: {
            type: "string",
            enum: [
              "emergency_fund",
              "job_loss",
              "cash_allocation",
              "investing",
              "retirement",
              "fire",
              "kids",
              "debt",
              "habits"
            ]
          },
          title: { type: "string" },
          rationale: { type: "string" },
          action: { type: "string" },
          monthlyImpact: { type: ["string", "null"] }
        }
      }
    },
    caveats: {
      type: "array",
      maxItems: 6,
      items: { type: "string" }
    }
  }
} as const;

export async function generateOpenAiAdvice({
  apiKey,
  model,
  snapshot,
  classicAdvice
}: {
  apiKey: string;
  model: string;
  snapshot: FinancialSnapshot;
  classicAdvice: ClassicAdviceResult;
}): Promise<AiAdviceResult> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_output_tokens: 2200,
      input: [
        {
          role: "system",
          content:
            "You are TL Finance AI, a careful household budget planning assistant. Give practical, jurisdiction-neutral planning guidance. Do not claim to be a regulated financial adviser. Preserve emergency-fund discipline before suggesting investment redeployment. Consider earners, temporary job loss, redistributable expenses, retirement, kid savings, FIRE planning, low-interest cash drag, debt, and healthy money habits. Return only JSON matching the schema."
        },
        {
          role: "user",
          content: JSON.stringify({
            snapshot: snapshotForAi(snapshot),
            classicAdvice,
            instruction:
              "Prioritize concrete recommendations that improve allocation without weakening short-term resilience."
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "tl_finance_ai_advice",
          strict: true,
          schema: RESPONSE_SCHEMA
        }
      }
    })
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data?.error?.message ||
      data?.error ||
      `OpenAI request failed with status ${res.status}`;
    throw new Error(message);
  }

  const outputText = extractOutputText(data);
  if (!outputText) {
    throw new Error("OpenAI response did not include output text");
  }

  const parsed = JSON.parse(outputText);
  return aiAdviceSchema.parse(parsed);
}

function extractOutputText(data: unknown): string {
  const obj = data as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{ text?: unknown; type?: string }>;
    }>;
  };

  if (typeof obj.output_text === "string") return obj.output_text;

  const chunks: string[] = [];
  for (const item of obj.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("");
}
