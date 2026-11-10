import assert from "node:assert/strict";
import { test } from "node:test";

import { isLocalRequest } from "./local-request";

const local = {
  host: "127.0.0.1:3006",
  origin: null,
  fetchSite: null,
  isApi: false,
};

test("accepts this computer's addresses", () => {
  assert.equal(isLocalRequest(local), true);
  assert.equal(isLocalRequest({ ...local, host: "localhost:3006" }), true);
  assert.equal(isLocalRequest({ ...local, host: "[::1]:3006" }), true);
});

test("refuses a missing or foreign Host, which stops DNS rebinding", () => {
  assert.equal(isLocalRequest({ ...local, host: null }), false);
  assert.equal(isLocalRequest({ ...local, host: "evil.test:3006" }), false);
});

test("lets another site link to a page", () => {
  assert.equal(isLocalRequest({ ...local, fetchSite: "cross-site" }), true);
});

test("refuses API calls started by another site", () => {
  const api = { ...local, isApi: true };
  assert.equal(isLocalRequest({ ...api, fetchSite: "same-origin" }), true);
  assert.equal(isLocalRequest({ ...api, fetchSite: "cross-site" }), false);
  assert.equal(isLocalRequest({ ...api, fetchSite: "same-site" }), false);
  assert.equal(isLocalRequest({ ...api, origin: "https://evil.test" }), false);
  assert.equal(isLocalRequest({ ...api, origin: "not a url" }), false);
  assert.equal(
    isLocalRequest({ ...api, origin: "http://127.0.0.1:3006" }),
    true
  );
});
