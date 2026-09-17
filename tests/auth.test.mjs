import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../server/auth.mjs";

test("senhas usam salt individual e rejeitam senha incorreta", async () => {
  const first = await hashPassword("a-long-password");
  const second = await hashPassword("a-long-password");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("a-long-password", first), true);
  assert.equal(await verifyPassword("wrong-password", first), false);
});
