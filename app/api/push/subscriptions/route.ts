import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SubscriptionInput = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

const BASE64_URL = /^[A-Za-z0-9_-]+$/;
const NO_STORE_HEADERS = { "cache-control": "private, no-store" } as const;

function isValidSubscription(input: SubscriptionInput) {
  return typeof input.endpoint === "string"
    && input.endpoint.length <= 2048
    && input.endpoint.startsWith("https://")
    && typeof input.keys?.p256dh === "string"
    && input.keys.p256dh.length <= 512
    && BASE64_URL.test(input.keys.p256dh)
    && typeof input.keys.auth === "string"
    && input.keys.auth.length <= 512
    && BASE64_URL.test(input.keys.auth);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false }, { status: 401, headers: NO_STORE_HEADERS });

  const input = await request.json().catch(() => null) as SubscriptionInput | null;
  if (!input || !isValidSubscription(input)) {
    return Response.json({ ok: false }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const admin = createSupabaseAdminClient();
  const { error: endpointError } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", input.endpoint as string)
    .neq("user_id", user.id);
  if (endpointError) {
    return Response.json({ ok: false }, { status: 500, headers: NO_STORE_HEADERS });
  }

  const { error } = await admin.from("push_subscriptions").upsert({
    user_id: user.id,
    endpoint: input.endpoint,
    p256dh: input.keys!.p256dh,
    auth: input.keys!.auth,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) return Response.json({ ok: false }, { status: 500, headers: NO_STORE_HEADERS });

  return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false }, { status: 401, headers: NO_STORE_HEADERS });

  const input = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  if (!input || typeof input.endpoint !== "string" || input.endpoint.length > 2048) {
    return Response.json({ ok: false }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", input.endpoint);
  if (error) return Response.json({ ok: false }, { status: 500, headers: NO_STORE_HEADERS });

  return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
