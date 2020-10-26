/**
 * Utility class for Base64 encoding and decoding.
 */
export class Base64 {
  static decode(encoded: string): ArrayBuffer {
    const binary = Buffer.from(encoded, 'base64').toString('binary')
    return Uint8Array.from(binary, (c) => c.charCodeAt(0))
  }

  static encode(buffer: ArrayBuffer): string {
    return Buffer.from(
      String.fromCharCode(...new Uint8Array(buffer)),
      'binary',
    ).toString('base64')
  }
}
