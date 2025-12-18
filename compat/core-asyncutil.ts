/**
 * Shim for @core/asyncutil
 * Provides async utilities like Mutex
 */

/**
 * A simple mutex for async code
 */
export class Mutex {
  #locked = false;
  #queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.#locked) {
      this.#locked = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.#queue.push(resolve);
    });
  }

  release(): void {
    const next = this.#queue.shift();
    if (next) {
      next();
    } else {
      this.#locked = false;
    }
  }

  async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  get locked(): boolean {
    return this.#locked;
  }
}

/**
 * A read-write lock
 */
export class RWLock {
  #readers = 0;
  #writer = false;
  #readQueue: Array<() => void> = [];
  #writeQueue: Array<() => void> = [];

  async acquireRead(): Promise<void> {
    if (!this.#writer && this.#writeQueue.length === 0) {
      this.#readers++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.#readQueue.push(resolve);
    });
  }

  releaseRead(): void {
    this.#readers--;
    this.#tryProcessQueue();
  }

  async acquireWrite(): Promise<void> {
    if (!this.#writer && this.#readers === 0) {
      this.#writer = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.#writeQueue.push(resolve);
    });
  }

  releaseWrite(): void {
    this.#writer = false;
    this.#tryProcessQueue();
  }

  #tryProcessQueue(): void {
    // Prioritize writers
    if (!this.#writer && this.#readers === 0 && this.#writeQueue.length > 0) {
      this.#writer = true;
      const next = this.#writeQueue.shift()!;
      next();
      return;
    }

    // Process readers if no writer
    if (!this.#writer && this.#writeQueue.length === 0) {
      while (this.#readQueue.length > 0) {
        this.#readers++;
        const next = this.#readQueue.shift()!;
        next();
      }
    }
  }

  async withReadLock<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.acquireRead();
    try {
      return await fn();
    } finally {
      this.releaseRead();
    }
  }

  async withWriteLock<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.acquireWrite();
    try {
      return await fn();
    } finally {
      this.releaseWrite();
    }
  }
}

/**
 * A semaphore for limiting concurrency
 */
export class Semaphore {
  #permits: number;
  #queue: Array<() => void> = [];

  constructor(permits: number) {
    this.#permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.#permits > 0) {
      this.#permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.#queue.push(resolve);
    });
  }

  release(): void {
    const next = this.#queue.shift();
    if (next) {
      next();
    } else {
      this.#permits++;
    }
  }

  async withPermit<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  get available(): number {
    return this.#permits;
  }
}

/**
 * A barrier for synchronizing multiple tasks
 */
export class Barrier {
  #count: number;
  #waiting = 0;
  #waiters: Array<() => void> = [];

  constructor(count: number) {
    this.#count = count;
  }

  async wait(): Promise<void> {
    this.#waiting++;
    if (this.#waiting >= this.#count) {
      // Release all waiters
      const waiters = this.#waiters;
      this.#waiters = [];
      this.#waiting = 0;
      for (const waiter of waiters) {
        waiter();
      }
      return;
    }

    return new Promise<void>((resolve) => {
      this.#waiters.push(resolve);
    });
  }
}

/**
 * WaitGroup for waiting on multiple tasks
 */
export class WaitGroup {
  #count = 0;
  #waiters: Array<() => void> = [];

  add(delta = 1): void {
    this.#count += delta;
  }

  done(): void {
    this.#count--;
    if (this.#count <= 0) {
      const waiters = this.#waiters;
      this.#waiters = [];
      for (const waiter of waiters) {
        waiter();
      }
    }
  }

  async wait(): Promise<void> {
    if (this.#count <= 0) return;

    return new Promise<void>((resolve) => {
      this.#waiters.push(resolve);
    });
  }
}

