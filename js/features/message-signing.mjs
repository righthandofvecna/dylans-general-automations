import { MODULENAME } from "../utils.mjs";

// Hardcoded trusted public keys (raw JWK objects).
// Keys here are not bound to a userId — any signature verifiable by one of
// these keys is trusted regardless of which userId it claims. Only add keys
// whose holder is unconditionally trusted (e.g., module developer overrides).
const GLOBAL_TRUSTED_KEYS = [
  {
    "crv": "P-256",
    "ext": true,
    "key_ops": ["verify"],
    "kty": "EC",
    "x": "xojUVDwlqpyKA_R5FbendwGCbtTbdRxuboAX9MeeK0s",
    "y": "HatTqYuP5Lfa-tuY8iIPKrmiV0UwfqJLzUtkYP5rlRI"
  },
];

let SOCKET;

const ECDSA_PARAMS = { name: "ECDSA", namedCurve: "P-256" };
const SIGN_PARAMS   = { name: "ECDSA", hash: { name: "SHA-256" } };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _toBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function _fromBase64url(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function _importPrivateKey(jwkString) {
  const jwk = JSON.parse(jwkString);
  return crypto.subtle.importKey("jwk", jwk, ECDSA_PARAMS, false, ["sign"]);
}

async function _importPublicKey(jwkObj) {
  return crypto.subtle.importKey("jwk", jwkObj, ECDSA_PARAMS, false, ["verify"]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify a signature produced by signMessage().
 *
 * @param {string} message                  The original plaintext message.
 * @param {{signature:string, userId:string, timestamp:number}} signatureObj
 *   The signature object returned by signMessage().
 * @param {number|null} [maxAgeMs=null]     If provided, reject signatures older
 *   than this many milliseconds (replay protection).
 * @returns {Promise<boolean>}
 */
export async function verifyMessage(message, signatureObj, maxAgeMs = null) {
  const { signature, userId, timestamp } = signatureObj;

  if (typeof signature !== "string" || typeof userId !== "string" || typeof timestamp !== "number") {
    return false;
  }

  if (maxAgeMs !== null && (Date.now() - timestamp) > maxAgeMs) {
    return false;
  }

  // Reconstruct the exact payload that was signed (fixed key order is critical).
  const payload = JSON.stringify({ message, userId, timestamp });
  const encoded = new TextEncoder().encode(payload);

  let sigBuffer;
  try {
    sigBuffer = _fromBase64url(signature);
  } catch {
    return false;
  }

  // 1. Check world public keys — matched by userId so identity is verified.
  const publicKeysRaw = game.settings.get(MODULENAME, "publicKeys");
  for (const entry of publicKeysRaw) {
    let parsed;
    try { parsed = JSON.parse(entry); } catch { continue; }
    if (parsed.userId !== userId) continue;
    try {
      const key = await _importPublicKey(parsed.publicKey);
      if (await crypto.subtle.verify(SIGN_PARAMS, key, sigBuffer, encoded)) return true;
    } catch { continue; }
  }

  // 2. Fall back to hardcoded GLOBAL_TRUSTED_KEYS — no userId binding.
  for (const jwkObj of GLOBAL_TRUSTED_KEYS) {
    try {
      const key = await _importPublicKey(jwkObj);
      if (await crypto.subtle.verify(SIGN_PARAMS, key, sigBuffer, encoded)) return true;
    } catch { continue; }
  }

  return false;
}

/**
 * Sign an arbitrary string message as the current GM user.
 * Lazily generates a key pair on first call if none is stored.
 *
 * @param {string} message
 * @returns {Promise<{signature:string, userId:string, timestamp:number}|null>}
 *   Returns null if the caller is not a GM.
 */
export async function signMessage(message) {
  if (!game.user.isGM) return null;

  let privateKeyRaw = game.settings.get(MODULENAME, "privateKey");
  if (!privateKeyRaw) {
    await generateKeyPair();
    privateKeyRaw = game.settings.get(MODULENAME, "privateKey");
    if (!privateKeyRaw) return null;
  }

  const userId    = game.user.id;
  const timestamp = Date.now();
  const payload   = JSON.stringify({ message, userId, timestamp });
  const encoded   = new TextEncoder().encode(payload);

  const privateKey = await _importPrivateKey(privateKeyRaw);
  const sigBuffer  = await crypto.subtle.sign(SIGN_PARAMS, privateKey, encoded);

  return { signature: _toBase64url(sigBuffer), userId, timestamp };
}

/**
 * Generate a new ECDSA P-256 key pair for the current GM user, persist the
 * private key in the client (localStorage) setting, and register the public
 * key in the world setting so other clients can verify this user's signatures.
 *
 * Any previously registered public key for this userId is replaced.
 *
 * @returns {Promise<CryptoKeyPair|null>}  Returns null if caller is not a GM.
 */
async function generateKeyPair() {
  if (!game.user.isGM) return null;

  const keyPair = await crypto.subtle.generateKey(
    ECDSA_PARAMS,
    true,   // extractable — required for JWK export and persistence
    ["sign", "verify"]
  );

  const [privateJwk, publicJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", keyPair.privateKey),
    crypto.subtle.exportKey("jwk", keyPair.publicKey),
  ]);

  // Private key is client-scoped (stored in localStorage for this browser only).
  await game.settings.set(MODULENAME, "privateKey", JSON.stringify(privateJwk));

  // Public key is world-scoped so all connected clients can verify signatures.
  const userId  = game.user.id;
  const existing = game.settings.get(MODULENAME, "publicKeys");
  const filtered = existing.filter(entry => {
    try { return JSON.parse(entry).userId !== userId; } catch { return true; }
  });
  filtered.push(JSON.stringify({ userId, publicKey: publicJwk }));
  await game.settings.set(MODULENAME, "publicKeys", filtered);

  return keyPair;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function register() {
  // Stored as a JWK JSON string. scope:"client" means Foundry persists this
  // in localStorage — it never leaves the browser and is never sent to the server.
  game.settings.register(MODULENAME, "privateKey", {
    label: "Private Key for message signing",
    scope: "client",
    type: String,
    default: "",
  });

  // Array of JSON strings, each: { userId: string, publicKey: JWK }.
  // world-scope means only GMs can write it, protecting against key injection.
  game.settings.register(MODULENAME, "publicKeys", {
    label: "Public Keys for message signing",
    scope: "world",
    type: new foundry.data.fields.ArrayField(new foundry.data.fields.StringField({})),
    default: [],
  });

  const MODULE = game.modules.get(MODULENAME);
  MODULE.api ??= {};
  MODULE.api.crypto ??= {};
  MODULE.api.crypto.signMessage = signMessage;
  MODULE.api.crypto.verifyMessage = verifyMessage;
}