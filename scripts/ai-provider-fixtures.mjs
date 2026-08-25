import assert from "node:assert/strict";
import {
  createMoodAnalysisInput,
  validateMoodAnalysisResult,
} from "../lib/mood-analysis.ts";
import {
  DEFAULT_OPENAI_MOOD_MODEL,
  getMoodAnalysisFailureDiagnostic,
  MoodAnalysisProviderError,
  requestOpenAIMoodAnalysis,
} from "../lib/openai-mood-provider.ts";

const input = createMoodAnalysisInput({
  date: "2026-08-25",
  recordedAt: "2026-08-25T04:00:00.000Z",
  stepOneKind: "medication_effect",
  answers: [
    { selected: ["weak"], customText: "", timingsByOption: { weak: ["점심"] } },
    { selected: ["irritable", "sleep"], customText: "", timingsByOption: {} },
    { selected: ["task"], customText: "", timingsByOption: {} },
  ],
  intakeMedicationIds: ["local-medication-id"],
});

const validResult = {
  todayEmotion: [
    {
      text: "점심부터 약효가 약하게 느껴졌어요.",
      evidenceIds: ["step1:weak"],
    },
    {
      text: "예민하게 느껴지는 순간과 잠에 관한 어려움이 있었어요.",
      evidenceIds: ["step2:irritable", "step2:sleep"],
    },
  ],
  clinicPhrase: {
    text: "점심부터 약효가 약하게 느껴졌고 업무나 과제에 집중하기 어려웠어요. 잠과 관련한 어려움도 상담해보고 싶어요.",
    evidenceIds: ["step1:weak", "step2:sleep", "step3:task"],
  },
};

function responseFor(result) {
  return new Response(JSON.stringify({
    output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

let capturedRequest;
const metadata = await requestOpenAIMoodAnalysis({
  input,
  apiKey: "fixture-only-secret",
  createdAt: "2026-08-25T04:00:01.000Z",
  fetchImpl: async (url, init) => {
    capturedRequest = { url, init };
    return responseFor(validResult);
  },
});
assert.equal(capturedRequest.url, "https://api.openai.com/v1/responses");
assert.equal(capturedRequest.init.method, "POST");
assert.equal(capturedRequest.init.headers.Authorization, "Bearer fixture-only-secret");
const requestBody = JSON.parse(capturedRequest.init.body);
assert.equal(requestBody.model, DEFAULT_OPENAI_MOOD_MODEL);
assert.equal(requestBody.store, false);
assert.deepEqual(requestBody.reasoning, { effort: "minimal" });
assert.equal(requestBody.max_output_tokens, 2_000);
assert.equal(requestBody.text.format.type, "json_schema");
assert.equal(requestBody.text.format.strict, true);
assert.equal(JSON.stringify(requestBody.text.format.schema).includes("uniqueItems"), false);
assert.equal(JSON.stringify(requestBody.text.format.schema).includes("minLength"), false);
assert.equal(JSON.stringify(requestBody.text.format.schema).includes("maxLength"), false);
assert.deepEqual(Object.keys(JSON.parse(requestBody.input)).sort(), ["date", "evidence", "hasMedicationIntake", "recordedAt"]);
assert.doesNotMatch(requestBody.input, /userId|email|kakao|google|analytics|local-medication-id/u);
assert.deepEqual(metadata.result, validResult);
assert.equal(metadata.createdAt, "2026-08-25T04:00:01.000Z");
console.log("PASS server provider request uses strict schema and excludes account identifiers");

const schemaFailure = await requestOpenAIMoodAnalysis({
  input,
  apiKey: "fixture-only-secret",
  fetchImpl: async () => responseFor({ todayEmotion: [] }),
}).catch((error) => error);
assert.ok(schemaFailure instanceof MoodAnalysisProviderError);
assert.deepEqual(getMoodAnalysisFailureDiagnostic(schemaFailure), {
  stage: "schema_validation",
  code: "invalid_schema",
});

const groundingFailure = await requestOpenAIMoodAnalysis({
    input,
    apiKey: "fixture-only-secret",
    fetchImpl: async () => responseFor({ ...validResult, clinicPhrase: { text: "상담하고 싶어요.", evidenceIds: ["unknown"] } }),
  }).catch((error) => error);
assert.ok(groundingFailure instanceof MoodAnalysisProviderError);
assert.deepEqual(getMoodAnalysisFailureDiagnostic(groundingFailure), {
  stage: "evidence_grounding",
  code: "invalid_evidence",
});
assert.throws(
  () => validateMoodAnalysisResult({ ...validResult, clinicPhrase: { text: "점심부터 두통이 있었어요.", evidenceIds: ["step1:weak"] } }, input),
  /unsupported_fact/,
);
assert.throws(
  () => validateMoodAnalysisResult({ ...validResult, clinicPhrase: { text: "약 용량을 늘려야 합니다.", evidenceIds: ["step1:weak"] } }, input),
  /unsafe_medical_claim/,
);
assert.throws(
  () => validateMoodAnalysisResult({ ...validResult, clinicPhrase: { text: "오전부터 약효가 약했어요.", evidenceIds: ["step1:weak"] } }, input),
  /unsupported_time/,
);
assert.throws(
  () => validateMoodAnalysisResult({
    ...validResult,
    clinicPhrase: {
      text: "업무 집중이 어려웠고 과제 집중이 어려웠고 업무에 집중하기 힘들었어요.",
      evidenceIds: ["step3:task"],
    },
  }, input),
  /low_quality_clinic_phrase/,
);
console.log("PASS invalid schema, unknown evidence, hallucinated fact, medical assertion, and unsupported time are rejected");

let attempts = 0;
const retryFetch = async () => {
  attempts += 1;
  return attempts === 1
    ? new Response("provider unavailable", { status: 503 })
    : responseFor(validResult);
};
const httpFailure = await requestOpenAIMoodAnalysis({
  input,
  apiKey: "fixture-only-secret",
  fetchImpl: retryFetch,
}).catch((error) => error);
assert.ok(httpFailure instanceof MoodAnalysisProviderError);
assert.deepEqual(getMoodAnalysisFailureDiagnostic(httpFailure), {
  stage: "provider_http",
  code: "provider_http_error",
  providerStatus: 503,
});
const retried = await requestOpenAIMoodAnalysis({ input, apiKey: "fixture-only-secret", fetchImpl: retryFetch });
assert.deepEqual(retried.result, validResult);
assert.equal(attempts, 2);
console.log("PASS a provider failure can be retried without changing client draft state");

const outputFailureCases = [
  {
    response: new Response("not-json", { status: 200 }),
    diagnostic: { stage: "response_body", code: "provider_response_not_json" },
  },
  {
    response: new Response(JSON.stringify({ output: [] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    diagnostic: { stage: "output_extract", code: "provider_output_missing" },
  },
  {
    response: new Response(JSON.stringify({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "reasoning" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }),
    diagnostic: { stage: "output_extract", code: "provider_output_incomplete_max_tokens" },
  },
  {
    response: new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: "not-json" }] }] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    diagnostic: { stage: "output_json", code: "provider_output_not_json" },
  },
];
for (const fixture of outputFailureCases) {
  const failure = await requestOpenAIMoodAnalysis({
    input,
    apiKey: "fixture-only-secret",
    fetchImpl: async () => fixture.response,
  }).catch((error) => error);
  assert.ok(failure instanceof MoodAnalysisProviderError);
  assert.deepEqual(getMoodAnalysisFailureDiagnostic(failure), fixture.diagnostic);
}

const medicalFailure = await requestOpenAIMoodAnalysis({
  input,
  apiKey: "fixture-only-secret",
  fetchImpl: async () => responseFor({
    ...validResult,
    clinicPhrase: { text: "약 용량을 늘려야 합니다.", evidenceIds: ["step1:weak"] },
  }),
}).catch((error) => error);
assert.deepEqual(getMoodAnalysisFailureDiagnostic(medicalFailure), {
  stage: "medical_safety",
  code: "unsafe_medical_claim",
});
console.log("PASS provider, output parsing, grounding, and medical safety failures are safely classified");

console.log("AI provider fixture cases: 4/4 passed");
