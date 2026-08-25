import {
  MOOD_ANALYSIS_SCHEMA,
  MOOD_ANALYSIS_VERSION,
  validateMoodAnalysisResult,
  type MoodAnalysisInput,
  type MoodAnalysisMetadata,
} from "./mood-analysis";

export const DEFAULT_OPENAI_MOOD_MODEL = "gpt-5-mini";

const MOOD_ANALYSIS_INSTRUCTIONS = `역할: 사용자의 하루 감정기록을 실제 진료실에서 그대로 읽거나 보여줄 수 있는 자연스러운 한국어 1인칭 문장으로 정리한다.

절대 규칙:
1. evidence가 유일한 사실 근거다. evidence에 없는 증상, 시간대, 빈도, 약 이름, 사건, 원인, 관계를 추가하지 않는다.
2. 선택 label을 쉼표로 나열하거나 그대로 이어 붙이지 말고, 서로 관련된 evidence만 자연스럽게 연결한다.
3. 진단, 질환 추정, 원인 단정, 약물 변경, 복용 중단, 용량 증감, 리바운드나 부작용 단정을 하지 않는다.
4. 관찰과 체감 중심으로 '~하게 느껴졌어요', '~가 함께 나타났어요', '~인지 상담해보고 싶어요'처럼 쓴다.
5. 하루 기록을 '최근', '반복적으로', '평소보다 계속' 같은 기간 패턴으로 확대하지 않는다.
6. 아침/오전/점심/오후/저녁은 evidence의 timeSlots로 직접 뒷받침될 때만 쓴다.
7. 각 문장 객체의 evidenceIds에는 그 문장을 직접 뒷받침하는 ID만 넣는다. 입력에 없는 ID를 만들지 않는다.
8. todayEmotion은 서로 다른 관찰을 담은 2~3개 문장, clinicPhrase는 1인칭 진료 전달 문장 1개로 작성한다.
9. JSON schema 외의 텍스트는 출력하지 않는다.`;

type OpenAIOutputContent = { type?: unknown; text?: unknown };
type OpenAIOutputItem = { content?: unknown };
type OpenAIResponseBody = {
  status?: unknown;
  incomplete_details?: unknown;
  output?: unknown;
};

export type MoodAnalysisFailureStage =
  | "provider_http"
  | "provider_runtime"
  | "response_body"
  | "output_extract"
  | "output_json"
  | "schema_validation"
  | "evidence_grounding"
  | "medical_safety"
  | "quality_validation";

export class MoodAnalysisProviderError extends Error {
  readonly stage: MoodAnalysisFailureStage;
  readonly diagnosticCode: string;
  readonly providerStatus?: number;

  constructor(
    stage: MoodAnalysisFailureStage,
    diagnosticCode: string,
    providerStatus?: number,
  ) {
    super(`mood_analysis_failed:${stage}`);
    this.name = "MoodAnalysisProviderError";
    this.stage = stage;
    this.diagnosticCode = diagnosticCode;
    this.providerStatus = providerStatus;
  }
}

function errorCode(error: unknown) {
  return error instanceof Error ? error.message : "unknown_error";
}

function validationStage(code: string): MoodAnalysisFailureStage {
  if (code === "invalid_schema") return "schema_validation";
  if (code === "unsafe_medical_claim") return "medical_safety";
  if (code === "low_quality_clinic_phrase") return "quality_validation";
  if (code === "invalid_evidence" || code.startsWith("unsupported_")) return "evidence_grounding";
  return "provider_runtime";
}

function readProviderErrorCode(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "provider_http_error";
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return "provider_http_error";
  const code = (error as { code?: unknown; type?: unknown }).code ?? (error as { type?: unknown }).type;
  return typeof code === "string" && /^[a-z0-9_.-]{1,80}$/iu.test(code) ? code : "provider_http_error";
}

export function getMoodAnalysisFailureDiagnostic(error: unknown) {
  if (error instanceof MoodAnalysisProviderError) {
    return {
      stage: error.stage,
      code: error.diagnosticCode,
      ...(error.providerStatus === undefined ? {} : { providerStatus: error.providerStatus }),
    };
  }
  return { stage: "provider_runtime" as const, code: "unclassified_error" };
}

export function createOpenAIMoodRequest(input: MoodAnalysisInput, model: string) {
  return {
    model,
    store: false,
    instructions: MOOD_ANALYSIS_INSTRUCTIONS,
    input: JSON.stringify(input),
    reasoning: { effort: "minimal" },
    max_output_tokens: 2_000,
    text: {
      format: {
        type: "json_schema",
        name: "mood_analysis",
        strict: true,
        schema: MOOD_ANALYSIS_SCHEMA,
      },
    },
  } as const;
}

function readOutputText(value: unknown) {
  const response = value as OpenAIResponseBody;
  if (response?.status === "incomplete") {
    const details = response.incomplete_details;
    const reason = details && typeof details === "object" && !Array.isArray(details)
      ? (details as { reason?: unknown }).reason
      : undefined;
    throw new Error(
      reason === "max_output_tokens"
        ? "provider_output_incomplete_max_tokens"
        : "provider_output_incomplete",
    );
  }
  if (!Array.isArray(response?.output)) throw new Error("provider_output_missing");
  for (const rawItem of response.output) {
    const item = rawItem as OpenAIOutputItem;
    if (!Array.isArray(item?.content)) continue;
    for (const rawContent of item.content) {
      const content = rawContent as OpenAIOutputContent;
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
      if (content?.type === "refusal") throw new Error("provider_output_refusal");
    }
  }
  throw new Error("provider_output_missing");
}

export async function requestOpenAIMoodAnalysis({
  input,
  apiKey,
  model = DEFAULT_OPENAI_MOOD_MODEL,
  fetchImpl = fetch,
  createdAt = new Date().toISOString(),
}: {
  input: MoodAnalysisInput;
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  createdAt?: string;
}): Promise<MoodAnalysisMetadata> {
  if (!apiKey.trim() || !model.trim()) {
    throw new MoodAnalysisProviderError("provider_runtime", "provider_not_configured");
  }

  let response: Response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createOpenAIMoodRequest(input, model)),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const code = error instanceof DOMException && error.name === "TimeoutError" ? "provider_timeout" : "provider_fetch_failed";
    throw new MoodAnalysisProviderError("provider_runtime", code);
  }

  if (!response.ok) {
    let code = "provider_http_error";
    try {
      code = readProviderErrorCode(await response.clone().json());
    } catch {
      // Keep the diagnostic generic when the provider did not return JSON.
    }
    throw new MoodAnalysisProviderError("provider_http", code, response.status);
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new MoodAnalysisProviderError("response_body", "provider_response_not_json");
  }

  let outputText: string;
  try {
    outputText = readOutputText(responseBody);
  } catch (error) {
    throw new MoodAnalysisProviderError("output_extract", errorCode(error));
  }

  let rawResult: unknown;
  try {
    rawResult = JSON.parse(outputText) as unknown;
  } catch {
    throw new MoodAnalysisProviderError("output_json", "provider_output_not_json");
  }

  let result: MoodAnalysisMetadata["result"];
  try {
    result = validateMoodAnalysisResult(rawResult, input);
  } catch (error) {
    const code = errorCode(error);
    throw new MoodAnalysisProviderError(validationStage(code), code);
  }

  return {
    result,
    version: MOOD_ANALYSIS_VERSION,
    model,
    createdAt,
  };
}
