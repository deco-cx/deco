import {
  PtySession,
  type PtySessionInfo,
  type PtySessionOptions,
} from "./session.ts";

export class SessionManager {
  #sessions = new Map<string, PtySession>();

  async spawn(opts: PtySessionOptions): Promise<PtySession> {
    const session = await PtySession.create(opts);
    this.#sessions.set(session.id, session);

    session.onExit(() => {
      // Keep exited sessions for status queries; cleanup on explicit kill or dispose
    });

    return session;
  }

  get(id: string): PtySession | undefined {
    return this.#sessions.get(id);
  }

  kill(id: string): boolean {
    const session = this.#sessions.get(id);
    if (!session) return false;
    session.kill();
    this.#sessions.delete(id);
    return true;
  }

  list(): PtySessionInfo[] {
    return Array.from(this.#sessions.values()).map((s) => s.info());
  }

  dispose(): void {
    for (const session of this.#sessions.values()) {
      session.dispose();
    }
    this.#sessions.clear();
  }
}
