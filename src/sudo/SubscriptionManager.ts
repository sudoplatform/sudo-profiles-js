import { SudoSubscriber, ChangeType, ConnectionState } from './sudo-subscriber'
import { Sudo } from './sudo'
import { Observable } from 'apollo-client/util/Observable'

export class SubscriptionManager<T> {
  public subscribers: Record<string, SudoSubscriber> = {}

  public subscription: ZenObservable.Subscription | undefined = undefined

  public watcher: Observable<T> | undefined = undefined

  /**
   * Adds or replaces a subscriber with the specified ID.
   *
   * @param id subscriber ID.
   * @param subscriber subscriber to subscribe.
   */
  public replaceSubscriber(id: string, subscriber: SudoSubscriber): void {
    this.subscribers[id] = subscriber
  }

  /**
   * Removes the subscriber with the specified ID.
   * and the subscription for that same ID
   * @param id subscriber ID.
   */
  public removeSubscriber(id: string): void {
    delete this.subscribers[id]
    const subscriberKeys = Object.keys(this.subscribers)
    if (!(subscriberKeys?.length > 0)) {
      this.subscription?.unsubscribe()
      this.watcher = undefined
      this.subscription = undefined
    }
  }

  /**
   * Removes all subscribers and subscriptions
   */
  public removeAllSubscribers(): void {
    this.subscribers = {}
    this.subscription?.unsubscribe()
    this.watcher = undefined
    this.subscription = undefined
  }

  /**
   * Notifies  subscribers of a new, updated or deleted Sudo.
   *
   * @param changeType change type. Please refer to [SudoSubscriber.ChangeType].
   * @param sudo new, updated or deleted Sudo.
   */
  public sudoChanged(changeType: ChangeType, sudo: Sudo): void {
    const subscribersToNotify = Object.keys(this.subscribers).map((key) => {
      return this.subscribers[key]
    })

    subscribersToNotify.forEach((subscriber) => {
      subscriber.sudoChanged(changeType, sudo)
    })
  }

  /**
   * Processes AppSync subscription connection status change.
   *
   * @param state connection state.
   */
  public connectionStatusChanged(state: ConnectionState): void {
    const subscribersToNotify = Object.keys(this.subscribers).map((key) => {
      return this.subscribers[key]
    })

    if (state == ConnectionState.Disconnected) {
      this.removeAllSubscribers()
      this.subscription?.unsubscribe()
      this.watcher = undefined
      this.subscription = undefined
    }

    subscribersToNotify.forEach((subscriber) => {
      subscriber.connectionStatusChanged(state)
    })
  }
}
