export function createSupabaseStorage(projectUrl, secret, request = (url, options) => globalThis.fetch(url, options)) {
  if (!projectUrl || !secret) return undefined;
  const url = new URL(projectUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Configure SUPABASE_URL com o endereço HTTPS do projeto Supabase.");
  }
  const endpoint = new URL("/rest/v1/rpc/casa64_storage", url);
  const headers = { apikey: secret, "Content-Type": "application/json" };
  if (!secret.startsWith("sb_secret_")) headers.Authorization = "Bearer " + secret;

  async function batch(operations) {
    const response = await request(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ operations }),
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Falha no armazenamento Supabase: HTTP " + response.status);
    return response.json();
  }

  return {
    batch,
    prepareOperation(name) {
      return { bind(...args) {
        const operation = { name, args };
        const run = async () => (await batch([operation]))[0];
        return {
          ...operation,
          run,
          all: run,
          first: async () => (await run()).results[0],
        };
      } };
    },
  };
}
