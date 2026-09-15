import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createSupabaseMedicationRepository } from '../repositories/medications/supabase';
import { createSupabaseMedicationIntakeRepository } from '../repositories/intake-records/supabase';
import { createSupabaseMoodRepository } from '../repositories/moods/supabase';
import { DuplicateMoodRecordError } from '../repositories/moods/types';
import { createSupabaseVisitScheduleRepository } from '../repositories/visit-schedules/supabase';
import { deleteAuthenticatedAccount } from '../account-deletion';
import { validateMoodAnalysisInput, type MoodAnalysisInput } from '../mood-analysis';
import { requestOpenAIMoodAnalysis, DEFAULT_OPENAI_MOOD_MODEL, getMoodAnalysisFailureDiagnostic } from '../openai-mood-provider';
import { classifyMoodAnalysisDiagnostic } from '../analytics/mood-contract';
import { searchMfdsMedications, getMfdsMedication, matchMfdsManualMedication, getMfdsImageCandidates, fetchVerifiedMfdsImage } from '../mfds-medications';
import type { AnalysisStage } from './preview-ai';
export { requestPreviewMoodAnalysis } from './preview-ai';
import { MAX_BODY_BYTES, NATIVE_API_ORIGIN, NATIVE_API_PREFIX, NativeRequestError, nativeApiPath, validateRepositoryRequest } from './contracts';

export type NativeApiDependencies = {
  supabaseUrl: string;
  authenticate: (token: string) => Promise<{ user: User | null; client: SupabaseClient }>;
  admin: () => SupabaseClient;
  openaiKey?: string;
  openaiModel?: string;
  analyzeMood?: (input: MoodAnalysisInput, token: string) => Promise<Response>;
  auditAnalysis?: (stage: AnalysisStage) => void;
};
async function readBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new NativeRequestError();
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new NativeRequestError();
  const reader = request.body?.getReader();
  if (!reader) throw new NativeRequestError();
  let length = 0; const chunks: Uint8Array[] = [];
  for (;;) {
    const {done, value} = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new NativeRequestError(); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new NativeRequestError(); }
}
export function createNativeApiHandler(deps: NativeApiDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers: Record<string,string> = { 'Cache-Control':'no-store', 'Vary':'Origin', 'X-Content-Type-Options':'nosniff' };
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
    // This deployment is deliberately locked to ADDI Dev, even if copied elsewhere.
    if (deps.supabaseUrl !== NATIVE_API_ORIGIN) return json({code:'ENVIRONMENT_DISABLED'},503);
    if (origin && origin !== 'https://localhost') return json({code:'ORIGIN_DENIED'},403);
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    const url = new URL(request.url);
    // Supabase's gateway strips /functions/v1 before invoking the worker.
    const prefix = [NATIVE_API_PREFIX, '/native-api'].find(value => url.pathname.startsWith(value + '/'));
    const path = prefix ? '/api/' + url.pathname.slice(prefix.length + 1) : '';
    if (!nativeApiPath(path)) return json({code:'NOT_FOUND'},404);
    const expectedMethod = path === '/api/account' ? 'DELETE' : ['/api/repository','/api/moods/analyze'].includes(path) ? 'POST' : 'GET';
    if (request.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = expectedMethod;
      headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
      return new Response(null,{status:204,headers});
    }
    if (request.method !== expectedMethod) return json({code:'METHOD_NOT_ALLOWED'},405);
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(request.headers.get('authorization') ?? '');
    if (!match) return json({code:'UNAUTHORIZED'},401);
    let identity;
    try { identity = await deps.authenticate(match[1]); } catch { return json({code:'UNAUTHORIZED'},401); }
    const {user, client} = identity;
    if (!user || user.is_anonymous) return json({code:'UNAUTHORIZED'},401);
    try {
      if (path === '/api/repository') {
        const {repository,method,args} = validateRepositoryRequest(await readBody(request));
        const repositories = {
          medications: createSupabaseMedicationRepository(user.id, client),
          medicationIntakes: createSupabaseMedicationIntakeRepository(user.id, client),
          moods: createSupabaseMoodRepository(user.id, client),
          visitSchedules: createSupabaseVisitScheduleRepository(user.id, client),
        };
        // No table names, owner IDs or arbitrary RPC names come from the request.
        const fn = (repositories[repository] as unknown as Record<string,(...args: unknown[]) => Promise<unknown>>)[method];
        return json({data: await fn(...args) ?? null});
      }
      if (path === '/api/account') {
        if (url.search) throw new NativeRequestError();
        // The Edge gateway can supply an empty stream for a bodyless DELETE.
        const reader = request.body?.getReader();
        if (reader) for (;;) {
          const {done, value} = await reader.read();
          if (done) break;
          if (value.byteLength) { await reader.cancel(); throw new NativeRequestError(); }
        }
        const admin = deps.admin();
        await deleteAuthenticatedAccount({
          getCurrentUser: async () => ({user,error:null}),
          deleteFeedback: async id => await admin.from('feedback').delete().eq('user_id',id),
          deleteAuthUser: async id => await admin.auth.admin.deleteUser(id, false),
        });
        return json({ok:true});
      }
      if (path === '/api/moods/analyze') {
        const body = await readBody(request);
        let input;
        try { input = validateMoodAnalysisInput(body?.input); } catch { throw new NativeRequestError(); }
        if (deps.analyzeMood) {
          deps.auditAnalysis?.('relay_start');
          const response = await deps.analyzeMood(input,match[1]);
          if (response.ok) deps.auditAnalysis?.('relay_success');
          return json(await response.json(),response.status);
        }
        if (!deps.openaiKey) {
          deps.auditAnalysis?.('configuration_missing');
          return json({code:'AI_NOT_CONFIGURED',failure_type:'configuration_error'},503);
        }
        try {
          deps.auditAnalysis?.('provider_start');
          const analysis = await requestOpenAIMoodAnalysis({input,apiKey:deps.openaiKey,model:deps.openaiModel || DEFAULT_OPENAI_MOOD_MODEL});
          deps.auditAnalysis?.('provider_success');
          return json(analysis);
        } catch (error) {
          deps.auditAnalysis?.('provider_failure');
          return json({code:'ANALYSIS_FAILED',failure_type:classifyMoodAnalysisDiagnostic(getMoodAnalysisFailureDiagnostic(error))},422);
        }
      }
      if (path === '/api/medications/search') {
        const q = url.searchParams.get('q')?.trim() ?? '';
        if (q.length > 50) throw new NativeRequestError();
        return json({medications:q ? await searchMfdsMedications(q) : []});
      }
      if (path === '/api/medications/manual-match') {
        const name = url.searchParams.get('name')?.trim() ?? '';
        const strength = Number(url.searchParams.get('strength'));
        if (!name || name.length > 50 || !Number.isFinite(strength) || strength <= 0) throw new NativeRequestError();
        return json(await matchMfdsManualMedication(name,strength));
      }
      const item = path.split('/').at(-1)!;
      if (path.startsWith('/api/medications/image/')) {
        for (const candidate of await getMfdsImageCandidates(item)) {
          const image = await fetchVerifiedMfdsImage(candidate);
          if (image) return new Response(new Uint8Array(image.bytes),{headers:{...headers,'Content-Type':image.contentType,'X-Addi-Image-Source':image.source}});
        }
        return json({code:'IMAGE_NOT_FOUND'},404);
      }
      const medication = await getMfdsMedication(item);
      return medication ? json({medication}) : json({code:'NOT_FOUND'},404);
    } catch (error) {
      if (error instanceof NativeRequestError) return json({code:'INVALID_REQUEST'},400);
      if (error instanceof DuplicateMoodRecordError) return json({code:'DUPLICATE_MOOD'},409);
      // Never return Postgres errors, health data, user IDs or provider credentials.
      return json({code:'REQUEST_FAILED'},502);
    }
  };
}
