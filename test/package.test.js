import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

// npm 11 builds a git dependency that has any of these scripts in a temporary
// clone. A global install then links its command to that clone after npm has
// deleted it, leaving a dead `grok-bridge` command. Keep them out so
// `npm install -g github:niharnm/grok-bridge#TAG` installs a working copy.
test("package defines no scripts that break GitHub installs", () => {
  for (const name of [
    "prepare",
    "prepack",
    "postpack",
    "preinstall",
    "install",
    "postinstall",
  ]) {
    assert.equal(pkg.scripts?.[name], undefined, `scripts.${name}`);
  }
});

test("package has no runtime dependencies to install", () => {
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(Object.keys(pkg.bin), ["grok-bridge"]);
});
