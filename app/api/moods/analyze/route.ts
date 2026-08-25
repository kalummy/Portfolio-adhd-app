import { NextResponse } from "next/server";
import {
  createLocalPreviewMoodAnalysis,
  validateMoodAnalysisInput,
  type MoodAnalysisInput,
} from "@/lib/mood-analysis";
import {
  DEFAULT_OPENAI_MOOD_MODEL,
  getMoodAnalysisFailureDiagnostic,
  requestOpenAIMoodAnalysis,
} from "@/lib/openai-mood-provider";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request) {
  let input: MoodAnalysisInput;
  try {
    const body = await request.json() as { input?: MoodAnalysisInput };
    input = validateMoodAnalysisInput(body.input);
  } catch {
    return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (process.env.VERCEL_ENV !== "production") {
      return NextResponse.json(createLocalPreviewMoodAnalysis(input), { headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ code: "AI_NOT_CONFIGURED" }, { status: 503, headers: NO_STORE_HEADERS });
  }

  try {
    const result = await requestOpenAIMoodAnalysis({
      input,
      apiKey,
      model: process.env.OPENAI_MOOD_MODEL?.trim() || DEFAULT_OPENAI_MOOD_MODEL,
    });
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("mood_analysis_failed", getMoodAnalysisFailureDiagnostic(error));
    return NextResponse.json({ code: "ANALYSIS_FAILED" }, { status: 422, headers: NO_STORE_HEADERS });
  }
}
