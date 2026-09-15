import { MOOD_ANALYSIS_VERSION, validateMoodAnalysisResult, type MoodAnalysisInput, type MoodAnalysisMetadata } from '../mood-analysis';

// Only this PR's Dev Preview can receive a user token. No caller-controlled URLs.
export const DEV_AI_PREVIEW_ORIGIN = 'https://addi-git-codex-capacitor-nati-5faccb-kalummy0427-2332s-projects.vercel.app';
export const DEV_AI_PREVIEW_PATH = '/api/native/moods/analyze';
export type AnalysisStage = 'configuration_missing' | 'relay_start' | 'relay_success' | 'provider_start' | 'provider_success' | 'provider_failure';

/** Protection credentials stay in Dev Edge Secrets, never in the APK or request URL. */
export async function requestPreviewMoodAnalysis(input: MoodAnalysisInput, token: string, bypass: string, requestId: string, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const failure = (code: string, status: number) => Response.json({code, failure_type:'provider_error'}, {status});
  if (!bypass.trim()) return failure('AI_NOT_CONFIGURED',503);
  let response: Response;
  try {
    response = await fetchImpl(DEV_AI_PREVIEW_ORIGIN + DEV_AI_PREVIEW_PATH, {
      method:'POST', redirect:'error', cache:'no-store', signal:AbortSignal.timeout(45_000),
      headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`, 'x-vercel-protection-bypass':bypass, 'x-addi-ai-request-id':requestId},
      body:JSON.stringify({input}),
    });
  } catch { return failure('AI_PREVIEW_UNAVAILABLE',502); }
  if (!response.ok) {
    // Preserve auth failures; never turn an invalid/expired session into configuration 503.
    if (response.status===401) return Response.json({code:'UNAUTHORIZED'}, {status:401});
    return failure('AI_PREVIEW_FAILED',response.status===422?422:502);
  }
  try {
    // Bound the result and revalidate the shared AI contract; HTML/login/mock output is rejected.
    const reader=response.body?.getReader(); if (!reader) throw new Error();
    let text='';let bytes=0;const decoder=new TextDecoder();
    for (;;) { const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>32_768){await reader.cancel();throw new Error();}text+=decoder.decode(value,{stream:true}); }
    text+=decoder.decode();
    const result=JSON.parse(text) as MoodAnalysisMetadata;
    if (result.version!==MOOD_ANALYSIS_VERSION || typeof result.model!=='string' || !/^gpt-[a-z0-9.-]{1,64}$/.test(result.model) || typeof result.createdAt!=='string' || !Number.isFinite(Date.parse(result.createdAt))) throw new Error();
    return Response.json({model:result.model,version:result.version,createdAt:result.createdAt,result:validateMoodAnalysisResult(result.result,input)});
  } catch { return failure('AI_PREVIEW_INVALID_RESULT',502); }
}
