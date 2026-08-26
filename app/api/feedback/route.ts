import { createClient } from "@supabase/supabase-js";
import { normalizeFeedbackText } from "@/lib/feedback";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

type FeedbackRequestBody = {
  feedbackText?: unknown;
};

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ ok: false }, { status: 415 });
  }

  let body: FeedbackRequestBody;
  try {
    body = await request.json() as FeedbackRequestBody;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const feedbackText = normalizeFeedbackText(body.feedbackText);
  if (!feedbackText) {
    return Response.json({ ok: false }, { status: 400 });
  }

  const sessionClient = await createServerSupabaseClient();
  const { data: userData } = await sessionClient.auth.getUser();
  const user = userData.user;
  const { url, publishableKey } = getSupabaseConfig();
  const client = user
    ? sessionClient
    : createClient(
        url,
        publishableKey,
        { auth: { persistSession: false } },
      );

  const { error } = await client.from("feedback").insert({
    feedback_text: feedbackText,
    route: "/feedback",
    user_id: user?.id ?? null,
  });

  if (error) {
    return Response.json({ ok: false }, { status: 500 });
  }

  return new Response(null, { status: 201 });
}
