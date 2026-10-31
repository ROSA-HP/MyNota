/** Base64 for Yjs updates (Realtime messages and the database functions use text). */

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK)
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(bin)
}

export function fromBase64(text: string): Uint8Array {
  const bin = atob(text)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** An update that carries nothing (Yjs encodes "no changes" in two bytes). */
export const isEmptyUpdate = (u: Uint8Array) => u.length <= 2
