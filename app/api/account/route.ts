import { AccountDeletionError, deleteAuthenticatedAccount } from "@/lib/account-deletion";
import {
  createSupabaseAdminClient,
  SupabaseAdminConfigurationError,
} from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ ok: false }, { status: 403 });
  }

  try {
    const sessionClient = await createServerSupabaseClient();
    let adminClient: ReturnType<typeof createSupabaseAdminClient> | null = null;
    const getAdminClient = () => adminClient ??= createSupabaseAdminClient();

    await deleteAuthenticatedAccount({
      getCurrentUser: async () => {
        const { data, error } = await sessionClient.auth.getUser();
        return { user: data.user, error };
      },
      deleteFeedback: async (userId) => {
        return getAdminClient()
          .from("feedback")
          .delete()
          .eq("user_id", userId);
      },
      deleteAuthUser: async (userId) => {
        return getAdminClient().auth.admin.deleteUser(userId, false);
      },
    });

    // deleteUser removes Auth sessions. This local sign-out also expires the
    // current browser's SSR auth cookies; errors after deletion are harmless.
    await sessionClient.auth.signOut({ scope: "local" }).catch(() => undefined);

    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AccountDeletionError && error.code === "unauthorized") {
      return Response.json({ ok: false }, { status: 401 });
    }
    if (error instanceof SupabaseAdminConfigurationError) {
      return Response.json({ ok: false }, { status: 503 });
    }
    return Response.json({ ok: false }, { status: 500 });
  }
}
