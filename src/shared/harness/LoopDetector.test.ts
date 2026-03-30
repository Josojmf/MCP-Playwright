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
