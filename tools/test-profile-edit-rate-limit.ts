import assert from "node:assert/strict";

import {
  getProfileEditRateLimitMessage,
} from "../src/server/profile/profile-edit-rate-limit";

function main() {
  const allowed = getProfileEditRateLimitMessage({
    allowed: true,
    reason: "allowed",
    retryAfterSeconds: 0,
  });

  assert.equal(allowed, null);
  console.log("Allowed profile update: PASS");

  const limited = getProfileEditRateLimitMessage({
    allowed: false,
    reason: "limited",
    retryAfterSeconds: 45,
  });

  assert.match(limited ?? "", /45 seconds/);
  console.log("Rate-limit rejection: PASS");

  const failOpen = getProfileEditRateLimitMessage({
    allowed: true,
    reason: "unavailable",
    retryAfterSeconds: null,
  });

  assert.equal(failOpen, null);
  console.log("Redis outage fail-open: PASS");

  const failClosed = getProfileEditRateLimitMessage({
    allowed: false,
    reason: "unavailable",
    retryAfterSeconds: null,
  });

  assert.match(
    failClosed ?? "",
    /temporarily unavailable/,
  );

  console.log("Redis outage fail-closed: PASS");
  console.log("ALL PROFILE RATE-LIMIT POLICY TESTS PASSED");
}

main();