import assert from "node:assert/strict";

import {
  enforceMemberDirectoryRateLimit,
  MemberDirectoryRateLimitError,
} from "../src/server/members/search-rate-limit";

function main() {
  assert.doesNotThrow(() => {
    enforceMemberDirectoryRateLimit({
      allowed: true,
      reason: "allowed",
      retryAfterSeconds: 0,
    });
  });
  console.log("Allowed directory request: PASS");

  assert.throws(
    () => {
      enforceMemberDirectoryRateLimit({
        allowed: false,
        reason: "limited",
        retryAfterSeconds: 20,
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof MemberDirectoryRateLimitError);
      assert.equal(error.retryAfterSeconds, 20);
      assert.equal(error.unavailable, false);
      return true;
    },
  );
  console.log("Excessive requests rejected: PASS");

  assert.doesNotThrow(() => {
    enforceMemberDirectoryRateLimit({
      allowed: true,
      reason: "unavailable",
      retryAfterSeconds: null,
    });
  });
  console.log("Redis outage fail-open: PASS");

  assert.throws(
    () => {
      enforceMemberDirectoryRateLimit({
        allowed: false,
        reason: "unavailable",
        retryAfterSeconds: null,
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof MemberDirectoryRateLimitError);
      assert.equal(error.unavailable, true);
      assert.equal(error.retryAfterSeconds, null);
      return true;
    },
  );
  console.log("Redis outage fail-closed: PASS");

  console.log("ALL MEMBER SEARCH POLICY TESTS PASSED");
}

main();