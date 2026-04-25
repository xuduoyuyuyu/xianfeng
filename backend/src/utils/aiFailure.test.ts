import assert from "assert";
import { isTransientAiGenerationFailure } from "./aiFailure";

assert.equal(isTransientAiGenerationFailure("fetch failed"), true);
assert.equal(isTransientAiGenerationFailure("Failed to fetch"), true);
assert.equal(isTransientAiGenerationFailure("ECONNRESET while calling upstream"), true);
assert.equal(isTransientAiGenerationFailure("音频格式不支持"), false);

console.log("aiFailure transient classifier tests passed");
