import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scrypt as derive } from "node:crypto";
import { promisify } from "node:util";
import { hashPassword, verifyPassword, needsRehash } from "../server/auth.mjs";

const scrypt = promisify(derive);

test("senhas usam salt individual e rejeitam senha incorreta", async () => {
  const first = await hashPassword("a-long-password");
  const second = await hashPassword("a-long-password");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("a-long-password", first), true);
  assert.equal(await verifyPassword("wrong-password", first), false);
});

test("hashPassword gera Argon2id, e o formato scrypt antigo ainda é aceito", async () => {
  const fresh = await hashPassword("a-long-password");
  assert.ok(fresh.startsWith("$argon2id$"));
  assert.equal(needsRehash(fresh), false);

  // Reproduz o formato "salt:chaveHex" usado antes da migração pra Argon2id
  // (ver verifyPassword em server/auth.mjs), pra garantir que contas antigas
  // que ainda não fizeram login continuam conseguindo entrar.
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt("a-long-password", salt, 64);
  const legacy = `${salt}:${key.toString("hex")}`;
  assert.equal(needsRehash(legacy), true);
  assert.equal(await verifyPassword("a-long-password", legacy), true);
  assert.equal(await verifyPassword("wrong-password", legacy), false);
});
