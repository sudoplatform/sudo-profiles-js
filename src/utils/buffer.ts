/**
 * Utility class for operating on ArrayBuffer.
 */
export class Buffer {
  static concat(lhs: ArrayBuffer, rhs: ArrayBuffer): ArrayBuffer {
    const combined = new Uint8Array(lhs.byteLength + rhs.byteLength)
    combined.set(new Uint8Array(lhs), 0)
    combined.set(new Uint8Array(rhs), lhs.byteLength)
    return combined.buffer
  }

  static split(
    buffer: ArrayBuffer,
    lhsLength: number,
  ): { lhs: ArrayBuffer; rhs: ArrayBuffer } {
    const array = new Uint8Array(buffer)
    const lhs = array.slice(0, lhsLength)
    const rhs = array.slice(lhsLength, array.length)
    return { lhs, rhs }
  }
}
