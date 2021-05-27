import * as t from 'io-ts'

export const SudoServiceConfigCodec = t.partial({
  region: t.string,
  bucket: t.string,
})

export type SudoServiceConfig = t.TypeOf<typeof SudoServiceConfigCodec>
