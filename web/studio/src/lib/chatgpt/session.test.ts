import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { pkceChallenge, PLAN_SCOPE, REDIRECT_URI, SCOPES } from "./oauth";
import { createChatGptSession, NotConnectedError } from "./session";

type Call = { url: string; form: URLSearchParams };

const tokens = (extra: Record<string, unknown> = {}) => ({
  access_token: "access-1",
  refresh_token: "refresh-1",
  id_token: "id-1",
  expires_in: 3600,
  scope: SCOPES,
  ...extra,
});

function harness(reply: (call: Call) => Response) {
  const calls: Call[] = [];
  let clock = 1_000_000;
  const folder = mkdtempSync(join(tmpdir(), "studio-session-"));
  const session = createChatGptSession({
    folder,
    now: () => clock,
    sleep: async () => undefined,
    verify: async (_token, { nonce }) => {
      assert.ok(nonce);
      return { sub: "user-1", email: "person@example.com" };
    },
    fetcher: (async (url: string, init?: RequestInit) => {
      const call = {
        url: String(url),
        form: new URLSearchParams(String(init?.body ?? "")),
      };
      calls.push(call);
      return reply(call);
    }) as typeof fetch,
  });
  return {
    calls,
    folder,
    session,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

async function signIn(h: ReturnType<typeof harness>, clientId = "oaiapp_1") {
  const url = new URL(await h.session.begin());
  const state = url.searchParams.get("state") ?? "";
  const result = await h.session.finish(
    new URLSearchParams({ code: "code-1", state, client_id: clientId })
  );
  return { url, result };
}

describe("signing in", () => {
  it("registers on first use with PKCE and the documented scopes", async () => {
    const h = harness(() => json(tokens()));
    const url = new URL(await h.session.begin());
    const q = url.searchParams;
    assert.equal(q.get("client_id"), "dynamic_agent_client");
    assert.equal(q.get("agent_name_hint"), "Clipscript Studio");
    assert.match(q.get("ext_agent_host_id") ?? "", /^urn:uuid:/);
    assert.equal(q.get("redirect_uri"), REDIRECT_URI);
    assert.equal(q.get("scope"), SCOPES);
    assert.equal(q.get("code_challenge_method"), "S256");

    const result = await h.session.finish(
      new URLSearchParams({
        code: "code-1",
        state: q.get("state") ?? "",
        client_id: "oaiapp_1",
      })
    );
    assert.equal(result, "connected");
    const exchange = h.calls[0]?.form;
    assert.equal(exchange?.get("grant_type"), "authorization_code");
    assert.equal(exchange?.get("client_id"), "oaiapp_1");
    assert.equal(
      pkceChallenge(exchange?.get("code_verifier") ?? ""),
      q.get("code_challenge")
    );
    assert.deepEqual(await h.session.status(), {
      signedIn: true,
      planEnabled: true,
      email: "person@example.com",
      model: null,
    });
  });

  it("refuses a wrong state without exchanging a code", async () => {
    const h = harness(() => json(tokens()));
    await h.session.begin();
    const result = await h.session.finish(
      new URLSearchParams({ code: "c", state: "forged", client_id: "x" })
    );
    assert.equal(result, "failed");
    assert.equal(h.calls.length, 0);
  });

  it("treats a registration with no issued client as unfinished", async () => {
    const h = harness(() => json(tokens()));
    const q = new URL(await h.session.begin()).searchParams;
    const result = await h.session.finish(
      new URLSearchParams({ code: "c", state: q.get("state") ?? "" })
    );
    assert.equal(result, "failed");
  });

  it("reports a declined consent", async () => {
    const h = harness(() => json(tokens()));
    const q = new URL(await h.session.begin()).searchParams;
    const result = await h.session.finish(
      new URLSearchParams({
        error: "access_denied",
        state: q.get("state") ?? "",
      })
    );
    assert.equal(result, "declined");
  });

  it("keeps the sign-in but marks plan use off without the scope", async () => {
    const h = harness(() => json(tokens({ scope: "openid email" })));
    const { result } = await signIn(h);
    assert.equal(result, "no-plan");
    assert.equal((await h.session.status()).planEnabled, false);
    await assert.rejects(() => h.session.token(), NotConnectedError);
  });

  it("reuses the issued client and host on a later sign-in", async () => {
    const h = harness(() => json(tokens()));
    const first = await signIn(h);
    const later = new URL(await h.session.begin()).searchParams;
    assert.equal(later.get("client_id"), "oaiapp_1");
    assert.equal(later.get("agent_name_hint"), null);
    assert.equal(later.get("id_token_hint"), "id-1");
    assert.equal(
      later.get("ext_agent_host_id"),
      first.url.searchParams.get("ext_agent_host_id")
    );
  });

  it("stores tokens encrypted", async () => {
    const h = harness(() => json(tokens()));
    await signIn(h);
    const stored = readFileSync(
      join(h.folder, "chatgpt", "session.enc"),
      "utf8"
    );
    assert.match(stored, /^v1\./);
    assert.doesNotMatch(stored, /access-1|refresh-1/);
  });
});

describe("tokens", () => {
  it("uses the saved token until near its end, then refreshes and rotates", async () => {
    let next = 1;
    const h = harness((call) =>
      call.form.get("grant_type") === "refresh_token"
        ? json(
            tokens({
              access_token: `access-${++next}`,
              refresh_token: `refresh-${next}`,
              id_token: undefined,
            })
          )
        : json(tokens())
    );
    await signIn(h);
    assert.equal(await h.session.token(), "access-1");
    assert.equal(h.calls.length, 1);

    h.advance(3590_000);
    assert.equal(await h.session.token(), "access-2");
    const refresh = h.calls[1]?.form;
    assert.equal(refresh?.get("client_id"), "oaiapp_1");
    assert.equal(refresh?.get("refresh_token"), "refresh-1");
    assert.equal(refresh?.get("scope"), null);

    h.advance(3590_000);
    await h.session.token();
    assert.equal(h.calls[2]?.form.get("refresh_token"), "refresh-2");
  });

  it("queues refreshes so a rotating token is spent once", async () => {
    let refreshes = 0;
    const h = harness((call) => {
      if (call.form.get("grant_type") === "refresh_token") refreshes += 1;
      return json(tokens({ access_token: `access-${refreshes}` }));
    });
    await signIn(h);
    h.advance(3590_000);
    await Promise.all([
      h.session.token(),
      h.session.token(),
      h.session.token(),
    ]);
    assert.equal(refreshes, 1);
  });

  it("clears tokens on a dead refresh token but keeps the client", async () => {
    let dead = false;
    const h = harness(() =>
      dead ? json({ error: "refresh_token_reused" }, 400) : json(tokens())
    );
    await signIn(h);
    dead = true;
    h.advance(3590_000);
    await assert.rejects(() => h.session.token(), NotConnectedError);
    assert.equal((await h.session.status()).signedIn, false);
    const q = new URL(await h.session.begin()).searchParams;
    assert.equal(q.get("client_id"), "oaiapp_1");
  });

  it("keeps tokens through a passing outage", async () => {
    let down = false;
    const h = harness(() =>
      down ? json({ error: "server_error" }, 503) : json(tokens())
    );
    await signIn(h);
    down = true;
    h.advance(3590_000);
    await assert.rejects(() => h.session.token());
    assert.equal((await h.session.status()).signedIn, true);
  });
});

describe("signing out", () => {
  const replies = (revoke: () => Response) => (call: Call) => {
    if (call.url.endsWith("openid-configuration"))
      return json({ revocation_endpoint: "https://auth.example/revoke" });
    if (call.url === "https://auth.example/revoke") return revoke();
    return json(tokens());
  };

  it("revokes the refresh token and keeps the host and client", async () => {
    const h = harness(replies(() => new Response(null, { status: 200 })));
    await signIn(h);
    assert.equal(await h.session.signOut(), true);
    const revoke = h.calls.find((c) => c.url.endsWith("/revoke"))?.form;
    assert.equal(revoke?.get("token"), "refresh-1");
    assert.equal(revoke?.get("token_type_hint"), "refresh_token");
    assert.equal((await h.session.status()).signedIn, false);
    const q = new URL(await h.session.begin()).searchParams;
    assert.equal(q.get("client_id"), "oaiapp_1");
    assert.equal(q.get("id_token_hint"), null);
  });

  it("says so when revocation is not confirmed", async () => {
    const h = harness(replies(() => new Response(null, { status: 500 })));
    await signIn(h);
    assert.equal(await h.session.signOut(), false);
    assert.equal((await h.session.status()).signedIn, false);
  });
});

describe("the plan scope", () => {
  it("is the documented direct-use scope", () => {
    assert.equal(PLAN_SCOPE, "chatgpt.tokens.use.direct");
  });
});
