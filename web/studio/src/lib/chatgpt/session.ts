import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { dataFolder } from "@/lib/data-folder";
import { installSecret } from "@/lib/install-secret";
import { createCipher } from "@/lib/script-writer/crypto";

import {
  authorizeUrl,
  DYNAMIC_CLIENT,
  exchangeCode,
  isUnusableRefresh,
  pkceChallenge,
  PLAN_SCOPE,
  randomToken,
  refreshTokens,
  revokeRefreshToken,
  TokenError,
  verifyIdToken,
  type Fetcher,
  type TokenResponse,
  type VerifyIdToken,
} from "./oauth";

/**
 * This computer's ChatGPT connection. Tokens stay here, encrypted, and go only
 * to OpenAI. The host id and issued client id outlive a sign-out, as OpenAI asks.
 */

const PENDING_MS = 10 * 60_000;
const REFRESH_MARGIN_MS = 2 * 60_000;

type Pending = {
  state: string;
  nonce: string;
  verifier: string;
  clientId: string;
  createdAt: number;
};

type Saved = {
  hostId?: string;
  clientId?: string;
  subject?: string;
  email?: string;
  idToken?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
  model?: string;
  pending?: Pending;
};

export type ChatGptStatus = {
  signedIn: boolean;
  planEnabled: boolean;
  email: string | null;
  model: string | null;
};

export type SignInResult =
  "connected" | "declined" | "no-plan" | "other-account" | "failed";

export class NotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotConnectedError";
  }
}

const scopesOf = (tokens: TokenResponse) =>
  tokens.scope?.split(/\s+/).filter(Boolean) ?? [];

export function createChatGptSession({
  folder = dataFolder(),
  fetcher = fetch,
  verify = verifyIdToken(fetcher),
  now = Date.now,
  sleep = (ms: number) => new Promise((done) => setTimeout(done, ms)),
}: {
  folder?: string;
  fetcher?: Fetcher;
  verify?: VerifyIdToken;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
} = {}) {
  const directory = join(folder, "chatgpt");
  const file = join(directory, "session.enc");
  const cipher = () => createCipher(installSecret(folder));

  const load = async (): Promise<Saved> => {
    try {
      const plain = cipher().decrypt(await readFile(file, "utf8"));
      return plain ? (JSON.parse(plain) as Saved) : {};
    } catch {
      return {};
    }
  };

  const save = async (saved: Saved) => {
    await mkdir(directory, { recursive: true });
    const partial = `${file}.${randomUUID()}.tmp`;
    await writeFile(partial, cipher().encrypt(JSON.stringify(saved)), {
      mode: 0o600,
    });
    await rename(partial, file);
  };

  // One change at a time, so a refresh's rotating token is never overwritten.
  let queue: Promise<unknown> = Promise.resolve();
  const change = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  };

  const clearTokens = (saved: Saved): Saved => ({
    hostId: saved.hostId,
    clientId: saved.clientId,
    model: saved.model,
  });

  const withTokens = (saved: Saved, tokens: TokenResponse): Saved => ({
    ...saved,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? saved.refreshToken,
    idToken: tokens.id_token ?? saved.idToken,
    expiresAt: now() + tokens.expires_in * 1000,
    scopes: tokens.scope ? scopesOf(tokens) : saved.scopes,
  });

  return {
    async status(): Promise<ChatGptStatus> {
      const saved = await load();
      return {
        signedIn: Boolean(saved.refreshToken),
        planEnabled: Boolean(saved.scopes?.includes(PLAN_SCOPE)),
        email: saved.email ?? null,
        model: saved.model ?? null,
      };
    },

    /** The address to send the browser to. */
    begin: () =>
      change(async () => {
        const saved = await load();
        const hostId = saved.hostId ?? `urn:uuid:${randomUUID()}`;
        const pending: Pending = {
          state: randomToken(),
          nonce: randomToken(),
          verifier: randomToken(),
          clientId: saved.clientId ?? DYNAMIC_CLIENT,
          createdAt: now(),
        };
        await save({ ...saved, hostId, pending });
        return authorizeUrl({
          clientId: pending.clientId,
          hostId,
          state: pending.state,
          nonce: pending.nonce,
          challenge: pkceChallenge(pending.verifier),
          idTokenHint: saved.idToken,
          loginHint: saved.email,
        });
      }),

    finish: (query: URLSearchParams): Promise<SignInResult> =>
      change(async () => {
        const saved = await load();
        const pending = saved.pending;
        const { pending: _used, ...rest } = saved;
        if (
          !pending ||
          query.get("state") !== pending.state ||
          now() - pending.createdAt > PENDING_MS
        )
          return "failed";
        await save(rest);

        if (query.get("error") === "access_denied") return "declined";
        const code = query.get("code");
        if (!code) return "failed";

        const returned = query.get("client_id");
        const registering = pending.clientId === DYNAMIC_CLIENT;
        if (registering && (!returned || returned === DYNAMIC_CLIENT))
          return "failed";
        if (!registering && returned && returned !== pending.clientId)
          return "failed";
        const clientId = registering ? (returned as string) : pending.clientId;

        try {
          const tokens = await exchangeCode(
            { clientId, code, verifier: pending.verifier },
            fetcher
          );
          if (!tokens.id_token) return "failed";
          const identity = await verify(tokens.id_token, {
            clientId,
            nonce: pending.nonce,
          });
          // A client belongs to one account. Forget it, and the next sign-in
          // registers a new one for the account they picked.
          if (!registering && rest.subject && rest.subject !== identity.sub) {
            await save({ hostId: rest.hostId, model: rest.model });
            return "other-account";
          }
          const next = {
            ...withTokens({ ...rest, clientId }, tokens),
            subject: identity.sub,
            email: identity.email,
          };
          await save(next);
          return next.scopes?.includes(PLAN_SCOPE) ? "connected" : "no-plan";
        } catch {
          return "failed";
        }
      }),

    /** A current access token, refreshed when near its end. */
    token: (force = false): Promise<string> =>
      change(async () => {
        const saved = await load();
        if (!saved.refreshToken || !saved.clientId)
          throw new NotConnectedError("Connect ChatGPT in Settings first.");
        if (!saved.scopes?.includes(PLAN_SCOPE))
          throw new NotConnectedError("ChatGPT plan use isn't turned on.");
        if (
          !force &&
          saved.accessToken &&
          (saved.expiresAt ?? 0) - now() > REFRESH_MARGIN_MS
        )
          return saved.accessToken;
        try {
          const tokens = await refreshTokens(
            { clientId: saved.clientId, refreshToken: saved.refreshToken },
            fetcher
          );
          await save(withTokens(saved, tokens));
          return tokens.access_token;
        } catch (error) {
          if (error instanceof TokenError && isUnusableRefresh(error.code)) {
            await save(clearTokens(saved));
            throw new NotConnectedError("Your ChatGPT sign-in has ended.");
          }
          throw error;
        }
      }),

    /** False means tokens are gone here but OpenAI did not confirm revocation. */
    signOut: (): Promise<boolean> =>
      change(async () => {
        const saved = await load();
        const confirmed =
          saved.refreshToken && saved.clientId
            ? await revokeRefreshToken(
                { clientId: saved.clientId, refreshToken: saved.refreshToken },
                fetcher,
                sleep
              )
            : true;
        await save(clearTokens(saved));
        return confirmed;
      }),

    setModel: (model: string) =>
      change(async () => save({ ...(await load()), model })),
  };
}

export type ChatGptSession = ReturnType<typeof createChatGptSession>;

const shared = globalThis as unknown as { chatGptSession?: ChatGptSession };

/** One instance per server process, so refreshes queue behind each other. */
export const chatGptSession = (): ChatGptSession =>
  (shared.chatGptSession ??= createChatGptSession());
