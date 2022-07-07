import { BufferUtil } from '../../src/util/buffer'

test('BufferUtil', () => {
  const lhs = new Uint8Array([1, 2, 3])
  const rhs = new Uint8Array([4, 5])

  const combined = BufferUtil.concat(lhs, rhs)
  expect(new Uint8Array(combined)).toEqual(new Uint8Array([1, 2, 3, 4, 5]))

  const splitted = BufferUtil.split(combined, 3)
  expect(splitted.lhs).toEqual(lhs)
  expect(splitted.rhs).toEqual(rhs)
})
