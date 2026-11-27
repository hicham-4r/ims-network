import assert from "node:assert/strict";
import { isPreviewRelayPublishEnabled } from "../src/server/realtime/stream-publisher-core";
import {
  isPreviewRelayActive,
  previewSocketLifetimeMs,
} from "../src/server/realtime/relay-activation-policy";

const preview = "ims-network:v1:preview";
let cases = 0;
for (const environment of ["preview", "production", "development", "", "Preview"]) {
  for (const ws of ["true", "false", "", "TRUE"]) {
    for (const relay of ["true", "false", "", "TRUE"]) {
      const e = { VERCEL_ENV: environment, IMS_PHASE16_WS_ENABLED: ws,
        IMS_PHASE16_RELAY_ENABLED: relay };
      const enabled = environment === "preview" && ws === "true" && relay === "true";
      assert.equal(isPreviewRelayActive(e, preview), enabled);
      assert.equal(isPreviewRelayPublishEnabled(e), enabled,
        "Publisher and reader must agree on flags");
      assert.equal(previewSocketLifetimeMs(e, preview), enabled ? 150_000 : 30_000);
      for (const invalidPrefix of ["ims-network:v1:production", "ims-network:v1:development", "", "typo"]) {
        assert.equal(isPreviewRelayActive(e, invalidPrefix), false,
          "Reader must never use non-Preview namespace");
        assert.equal(previewSocketLifetimeMs(e, invalidPrefix), 30_000);
      }
      cases++;
    }
  }
}
console.log(`PASS: ${cases} Preview flag combinations; publisher/reader gate agreement`);
console.log("PASS: Namespace and off-state retain 30-second WS-only lease");
console.log("PHASE 16.19N ACTIVATION POLICY: PASS");
