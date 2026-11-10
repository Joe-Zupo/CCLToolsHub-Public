import { createHash, randomBytes } from "node:crypto";

import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Sign in with ChatGPT with plan usage, as OpenAI documents it for open-source
 * and locally hosted apps. No client secret: each person's sign-in registers
 * its own client, and the issued id comes back on the callback.
 */

export const APP_NAME = "Clipscript Studio";
export const STUDIO_ORIGIN = "http://127.0.0.1:3006";
export const REDIRECT_URI = `${STUDIO_ORIGIN}/auth/callback`;

export const ISSUER = "https://auth.openai.com";
export const AUTHORIZE_URL = `${ISSUER}/api/accounts/authorize`;
export const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
export const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
export const RESOURCE = "https://api.openai.com/v1";

export const DYNAMIC_CLIENT = "dynamic_agent_client";
export const PLAN_SCOPE = "chatgpt.tokens.use.direct";
export const SCOPES = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;

export type Fetcher = typeof fetch;

export const randomToken = () => randomBytes(32).toString("base64url");

export const pkceChallenge = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");

export function authorizeUrl(request: {
  clientId: string;
  hostId: string;
  state: string;
  nonce: string;
  challenge: string;
  idTokenHint?: string;
  loginHint?: string;
}): string {
  const registering = request.clientId === DYNAMIC_CLIENT;
  const query = new URLSearchParams({
    client_id: request.clientId,
    ...(registering ? { agent_name_hint: APP_NAME } : {}),
    ext_agent_host_id: request.hostId,
    ...(!registering && request.idTokenHint
      ? { id_token_hint: request.idTokenHint }
      : {}),
    ...(!registering && request.loginHint
      ? { login_hint: request.loginHint }
      : {}),
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    resource: RESOURCE,
    state: request.state,
    nonce: request.nonce,
    code_challenge_method: "S256",
    code_challenge: request.challenge,
  });
  return `${AUTHORIZE_URL}?${query}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope?: string;
};

export class TokenError extends Error {
  constructor(
    readonly code: string,
    readonly status: number
  ) {
    super(`Token request failed: ${code}`);
    this.name = "TokenError";
  }
}

/** A refresh token that can never work again, as opposed to a passing failure. */
export const isUnusableRefresh = (code: string) =>
  [
    "invalid_grant",
    "invalid_refresh_token",
    "token_expired",
    "refresh_token_expired",
    "refresh_token_invalidated",
    "refresh_token_reused",
  ].includes(code);

const errorCode = (body: unknown): string => {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === "string") return error;
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : "unknown_error";
};

export async function tokenRequest(
  fields: Record<string, string>,
  fetcher: Fetcher
): Promise<TokenResponse> {
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new TokenError(errorCode(body), response.status);
  return body as TokenResponse;
}

export const exchangeCode = (
  grant: { clientId: string; code: string; verifier: string },
  fetcher: Fetcher
) =>
  tokenRequest(
    {
      grant_type: "authorization_code",
      client_id: grant.clientId,
      code: grant.code,
      code_verifier: grant.verifier,
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE,
    },
    fetcher
  );

export const refreshTokens = (
  grant: { clientId: string; refreshToken: string },
  fetcher: Fetcher
) =>
  tokenRequest(
    {
      grant_type: "refresh_token",
      client_id: grant.clientId,
      refresh_token: grant.refreshToken,
      resource: RESOURCE,
    },
    fetcher
  );

type Discovery = { jwks_uri?: string; revocation_endpoint?: string };

const discovery = async (fetcher: Fetcher): Promise<Discovery> => {
  const response = await fetcher(DISCOVERY_URL);
  if (!response.ok) throw new Error("Could not read OpenAI's sign-in details.");
  return (await response.json()) as Discovery;
};

export type IdentityClaims = { sub: string; email?: string };

export type VerifyIdToken = (
  token: string,
  expected: { clientId: string; nonce: string }
) => Promise<IdentityClaims>;

/** Checks the signature against OpenAI's keys, then issuer, audience and nonce. */
export const verifyIdToken =
  (fetcher: Fetcher): VerifyIdToken =>
  async (token, { clientId, nonce }) => {
    const { jwks_uri: jwksUri } = await discovery(fetcher);
    if (!jwksUri) throw new Error("OpenAI's sign-in details have no key set.");
    const { payload } = await jwtVerify(
      token,
      createRemoteJWKSet(new URL(jwksUri)),
      { issuer: ISSUER, audience: clientId }
    );
    if (payload.nonce !== nonce) throw new Error("The sign-in nonce differs.");
    if (!payload.sub) throw new Error("The sign-in has no account.");
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  };

/** True only when OpenAI confirmed the revocation. */
export async function revokeRefreshToken(
  grant: { clientId: string; refreshToken: string },
  fetcher: Fetcher,
  sleep: (ms: number) => Promise<void>
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await sleep(1000 * attempt);
    try {
      const { revocation_endpoint: endpoint } = await discovery(fetcher);
      if (!endpoint) return false;
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: grant.refreshToken,
          token_type_hint: "refresh_token",
          client_id: grant.clientId,
        }),
      });
      if (response.ok) return true;
      if (response.status < 500) return false;
    } catch {
      // Try again while the token is still here.
    }
  }
  return false;
}
