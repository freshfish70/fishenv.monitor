class Mutex {
  #promise: Promise<void> | undefined;
  #resolve: (() => void) | undefined;

  async lock() {
    while (this.#promise) await this.#promise;
    const { resolve, promise } = Promise.withResolvers<void>();
    this.#promise = promise;
    this.#resolve = resolve;
  }

  unlock() {
    const resolve = this.#resolve;
    this.#promise = undefined;
    this.#resolve = undefined;
    resolve?.();
  }
}

export default Mutex;
