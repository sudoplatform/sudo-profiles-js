/*
 * Copyright © 2023 Anonyome Labs, Inc. All rights reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import * as t from 'io-ts'

// eslint-disable-next-line tree-shaking/no-side-effects-in-initialization
export const SudoServiceConfigCodec = t.partial({
  region: t.string,
  bucket: t.string,
})

export type SudoServiceConfig = t.TypeOf<typeof SudoServiceConfigCodec>
