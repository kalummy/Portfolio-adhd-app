export const dynamic = "force-dynamic";

const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'",
};

const allowedParameters = new Set([
  "attempt", "code", "error", "error_code", "error_description",
]);

// Android handles the verified App Link and exchanges the code itself.
// This browser fallback never reads a session or reflects callback values.
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const attempt = params.get("attempt");
  const code = params.get("code");
  const error = params.get("error");
  const malformed = [...params.keys()].some((key) =>
    !allowedParameters.has(key) || params.getAll(key).length !== 1
  ) || !attempt || !/^[a-f0-9]{64}$/.test(attempt)
    || Boolean(code) === Boolean(error)
    || Boolean(code && (code.length > 2048 || /\s/.test(code)))
    || Boolean(code && (params.has("error_code") || params.has("error_description")));

  if (malformed || error) {
    return new Response("Native OAuth callback could not be completed.", {
      status: 400,
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response("<!doctype html><html><head><meta name=\"referrer\" content=\"no-referrer\"></head><body></body></html>", {
    status: 200,
    headers,
  });
}
