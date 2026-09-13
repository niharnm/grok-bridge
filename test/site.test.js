import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const script = readFileSync(
  new URL("../docs/site.js", import.meta.url),
  "utf8",
);
const html = readFileSync(
  new URL("../docs/index.html", import.meta.url),
  "utf8",
);
const command = html.match(/<code id="install-command">([^<]+)<\/code>/)[1];

function mount(clipboard) {
  let click;
  const button = {
    hidden: true,
    dataset: { copy: "install-command" },
    addEventListener: (_, handler) => {
      click = handler;
    },
  };
  const status = { textContent: "" };
  runInNewContext(script, {
    document: {
      querySelector: (selector) =>
        selector === "[data-copy]" ? button : status,
      getElementById: (id) => {
        assert.equal(id, "install-command");
        return { textContent: command };
      },
    },
    navigator: { clipboard },
  });
  return { button, status, click };
}

test("landing copy action writes the exact published installation command", async () => {
  let written;
  const ui = mount({
    writeText: async (text) => {
      written = text;
    },
  });
  assert.equal(ui.button.hidden, false);
  await ui.click();
  assert.equal(
    written,
    "npm install -g github:niharnm/grok-bridge#v0.1.0-alpha.1",
  );
  assert.equal(ui.status.textContent, "Installation command copied.");
});

test("clipboard denial keeps the visible command and reports manual recovery", async () => {
  const ui = mount({
    writeText: async () => {
      throw new Error("Permission denied");
    },
  });
  await ui.click();
  assert.match(ui.status.textContent, /Select and copy the command above/);
  assert.doesNotMatch(ui.status.textContent, /command copied/);
  assert.ok(html.includes(command));
});

test("unsupported clipboard leaves the nonfunctional button hidden", () => {
  const ui = mount(undefined);
  assert.equal(ui.button.hidden, true);
  assert.equal(ui.click, undefined);
  assert.ok(html.includes(command));
});
