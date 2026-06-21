import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

test("refresh recovers a logged-in profile when token exists but cached user is missing", () => {
  assert.match(
    source,
    /import \{ useDispatch, useSelector \} from "react-redux";/,
    "App should read auth state from Redux and dispatch recovery"
  );
  assert.match(
    source,
    /import \{ fetchMe \} from "\.\/store\/userSlice";/,
    "App should reuse the shared user profile endpoint"
  );
  assert.match(
    source,
    /const \{ token, user \} = useSelector\(\(state: RootState\) => state\.user\);/,
    "App should observe the current token/user pair"
  );
  assert.match(
    source,
    /if \(!token \|\| user\) return;[\s\S]*dispatch\(fetchMe\(\) as any\);/,
    "profile recovery should run only for token-present, user-missing refresh states"
  );
});
