import { ApiError } from "./http";

function decodeBase64(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new ApiError(500, "Credential encryption is not configured", "encryption_unavailable");
  }
}

function encodeBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptionKey(encodedKey: string): Promise<CryptoKey> {
  const keyBytes = decodeBase64(encodedKey);
  if (keyBytes.byteLength !== 32) {
    throw new ApiError(500, "Credential encryption is not configured", "encryption_unavailable");
  }
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(secret: string, encodedKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(encodedKey),
    new TextEncoder().encode(secret),
  );
  return `${encodeBase64(iv)}.${encodeBase64(ciphertext)}`;
}

export async function decryptSecret(payload: string, encodedKey: string): Promise<string> {
  const [ivValue, ciphertextValue, extra] = payload.split(".");
  if (!ivValue || !ciphertextValue || extra) throw new ApiError(500, "Stored credential is invalid", "credential_invalid");
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decodeBase64(ivValue) },
      await encryptionKey(encodedKey),
      decodeBase64(ciphertextValue),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new ApiError(500, "Stored credential cannot be decrypted", "credential_invalid");
  }
}
