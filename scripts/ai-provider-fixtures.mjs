import assert from "node:assert/strict";
import {
  createMoodAnalysisInput,
  validateMoodAnalysisResult,
} from "../lib/mood-analysis.ts";
import {
  DEFAULT_OPENAI_MOOD_MODEL,
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
assert.equal(requestBody.text.format.type, "json_schema");
assert.equal(requestBody.text.format.strict, true);
assert.deepEqual(Object.keys(JSON.parse(requestBody.input)).sort(), ["date", "evidence", "hasMedicationIntake", "recordedAt"]);
assert.doesNotMatch(requestBody.input, /userId|email|kakao|google|analytics|local-medication-id/u);
assert.deepEqual(metadata.result, validResult);
assert.equal(metadata.createdAt, "2026-08-25T04:00:01.000Z");
console.log("PASS server provider request uses strict schema and excludes account identifiers");

await assert.rejects(
  requestOpenAIMoodAnalysis({ input, apiKey: "fixture-only-secret", fetchImpl: async () => responseFor({ todayEmotion: [] }) }),
  /invalid_schema/,
);
await assert.rejects(
  requestOpenAIMoodAnalysis({
    input,
    apiKey: "fixture-only-secret",
    fetchImpl: async () => responseFor({ ...validResult, clinicPhrase: { text: "상담하고 싶어요.", evidenceIds: ["unknown"] } }),
  }),
  /invalid_evidence/,
);
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
await assert.rejects(
  requestOpenAIMoodAnalysis({ input, apiKey: "fixture-only-secret", fetchImpl: retryFetch }),
  /provider_request_failed:503/,
);
const retried = await requestOpenAIMoodAnalysis({ input, apiKey: "fixture-only-secret", fetchImpl: retryFetch });
assert.deepEqual(retried.result, validResult);
assert.equal(attempts, 2);
console.log("PASS a provider failure can be retried without changing client draft state");

console.log("AI provider fixture cases: 3/3 passed");
