import { Buffer as BufferUtil } from '../../src/utils/buffer'

describe('Buffer', () => {
  it('split()', () => {
    const buffer = Buffer.from('1234567', 'utf8')
    const { lhs, rhs } = BufferUtil.split(buffer, 3)
    expect(Buffer.from(lhs).toString('utf8')).toBe('123')
    expect(Buffer.from(rhs).toString('utf8')).toBe('4567')
  })

  it('concat()', () => {
    const lhs = Buffer.from('123', 'utf8')
    const rhs = Buffer.from('4567', 'utf8')
    const buffer = BufferUtil.concat(lhs, rhs)
    expect(Buffer.from(buffer).toString('utf8')).toBe('1234567')
  })
})
