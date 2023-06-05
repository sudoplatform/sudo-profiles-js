/*
 * Copyright © 2023 Anonyome Labs, Inc. All rights reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sudo } from './sudo'

/**
 * Sudo change type.
 */
export enum ChangeType {
  /**
   *  Sudo was created.
   */
  Create,
  /**
   * Sudo was updated.
   */
  Update,
  /**
   * Sudo was deleted.
   */
  Delete,
}

/**
 * Connection state of the subscription.
 */
export enum ConnectionState {
  /**
   * Connected and receiving updates.
   */
  Connected,

  /**
   * Disconnected and won't receive any updates. When disconnected all subscribers will be
   * unsubscribed so the consumer must re-subscribe.
   */
  Disconnected,
}

/**
 * Subscriber for receiving notifications about new, updated or deleted Sudo.
 */
export interface SudoSubscriber {
  /**
   * Notifies the subscriber of a new, updated or deleted Sudo.
   *
   * @param changeType change type. Please refer to [ChangeType] enum.
   * @param sudo new, updated or deleted Sudo.
   */
  sudoChanged(changeType: ChangeType, sudo: Sudo): void

  /**
   * Notifies the subscriber that the subscription connection state has changed. The subscriber won't be
   * notified of Sudo changes until the connection status changes to [ConnectionState.CONNECTED]. The subscriber will
   * stop receiving Sudo change notifications when the connection state changes to [ConnectionState.DISCONNECTED].
   * @param state connection state.
   */
  connectionStatusChanged(state: ConnectionState): void
}
