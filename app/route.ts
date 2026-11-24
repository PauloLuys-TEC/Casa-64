import shell from "../lib/shell.html?raw";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com https://*.openai.com",
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
  if (new URL(request.url).protocol === "https:") headers["Strict-Transport-Security"] = "max-age=31536000";
  return new Response(shell, { headers });
}
