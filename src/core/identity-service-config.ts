import * as t from 'io-ts'

// eslint-disable-next-line tree-shaking/no-side-effects-in-initialization
export const IdentityServiceConfigCodec = t.intersection([
  // eslint-disable-next-line tree-shaking/no-side-effects-in-initialization
  t.type({
    region: t.string,
    poolId: t.string,
    clientId: t.string,
    identityPoolId: t.string,
    apiUrl: t.string,
    apiKey: t.string,
    transientBucket: t.string,
    // eslint-disable-next-line tree-shaking/no-side-effects-in-initialization
    registrationMethods: t.array(t.string),
  }),
  // eslint-disable-next-line tree-shaking/no-side-effects-in-initialization
  t.partial({
    bucket: t.string,
  }),
])

export type IdentityServiceConfig = t.TypeOf<typeof IdentityServiceConfigCodec>
