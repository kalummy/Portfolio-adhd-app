import { APP_VERSION_POLICY } from "@/lib/app-version";

export function GET() {
  return Response.json(APP_VERSION_POLICY, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
