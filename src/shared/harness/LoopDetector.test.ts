import assert from "node:assert/strict";
import test from "node:test";
import { LoopDetector, LoopError } from "./LoopDetector";

test("LoopDetector throws on repeated identical calls", () => {
  const detector = new LoopDetector(3, 20);

  detector.recordAndCheck({ name: "browser_click", argsString: "#submit" });
  detector.recordAndCheck({ name: "browser_click", argsString: "#submit" });

  assert.throws(
    () => detector.recordAndCheck({ name: "browser_click", argsString: "#submit" }),
    (error: unknown) => error instanceof LoopError
  );
});

test("LoopDetector throws when tool budget is exceeded", () => {
  const detector = new LoopDetector(10, 2);

  detector.recordAndCheck({ name: "browser_type", argsString: "input[name='q']" });
  detector.recordAndCheck({ name: "browser_type", argsString: "input[name='q']" });

  assert.throws(
    () => detector.recordAndCheck({ name: "browser_type", argsString: "input[name='q']" }),
    (error: unknown) => error instanceof LoopError
  );
});

test("LoopDetector detects loop on identical tool name + serialized args", () => {
  const ld = new LoopDetector(3, 20);
  ld.recordAndCheck({ name: "browser_click", argsString: '{"selector":"#btn"}' });
  ld.recordAndCheck({ name: "browser_click", argsString: '{"selector":"#btn"}' });
  assert.throws(
    () => ld.recordAndCheck({ name: "browser_click", argsString: '{"selector":"#btn"}' }),
    LoopError
  );
});

test("LoopDetector does NOT trigger loop on same tool name with different args", () => {
  const ld = new LoopDetector(3, 20);
  ld.recordAndCheck({ name: "browser_click", argsString: '{"selector":"#btn1"}' });
  ld.recordAndCheck({ name: "browser_click", argsString: '{"selector":"#btn2"}' });
  ld.recordAndCheck({ name: "browser_click", argsString: '{"selector":"#btn3"}' });
  // Should not throw — args are different each time
});

test("LoopDetector does NOT trigger loop on different tool names with same args", () => {
  const ld = new LoopDetector(3, 20);
  ld.recordAndCheck({ name: "browser_click", argsString: '{"url":"x"}' });
  ld.recordAndCheck({ name: "browser_navigate", argsString: '{"url":"x"}' });
  ld.recordAndCheck({ name: "browser_snapshot", argsString: '{"url":"x"}' });
  // Should not throw — tool names differ
});
