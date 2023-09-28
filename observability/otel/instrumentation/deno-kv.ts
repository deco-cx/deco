// deno-lint-ignore-file no-this-alias no-explicit-any
/**
 * Heavily inspired from unlicense code: https://github.com/cloudydeno/deno-observability/blob/main/instrumentation/deno-kv.ts
 */
import {
    InstrumentationBase,
    Span,
    SpanKind,
    instrumentationIsWrapped as isWrapped,
    type InstrumentationConfig,
} from "../../../deps.ts";

const listSpans = new WeakMap<
  Deno.KvListIterator<unknown>,
  { span: Span; docCount: number }
>();

export class DenoKvInstrumentation extends InstrumentationBase {
  readonly component: string = "deno-kv";
  moduleName = this.component;
  atomicOpClass?: typeof Deno.AtomicOperation.constructor;

  constructor(config?: InstrumentationConfig) {
    super("deno-kv", "0.1.0", config);
  }

  init(): void {}

  private _patchAtomic(): (
    original: typeof Deno.Kv.prototype.atomic,
  ) => typeof Deno.Kv.prototype.atomic {
    return (original) => {
      const plugin = this;
      return function patchAtomic(
        this: Deno.Kv,
      ): Deno.AtomicOperation {
        const op = original.call(this);
        if (!plugin.atomicOpClass) {
          plugin.atomicOpClass = op
            .constructor as typeof Deno.AtomicOperation.constructor;
          plugin.hookAtomicOpClass();
        }
        return op;
      };
    };
  }

  private _patchGet(): (
    original: typeof Deno.Kv.prototype.get,
  ) => typeof Deno.Kv.prototype.get {
    return (original) => {
      const plugin = this;
      return async function patchGet(
        this: Deno.Kv,
        key: Deno.KvKey,
        opts?: {
          consistency?: Deno.KvConsistencyLevel;
        },
      ): Promise<Deno.KvEntryMaybe<any>> {
        const span = plugin.tracer.startSpan(`Kv get`, {
          kind: SpanKind.CLIENT,
          attributes: {
            "db.system": "deno-kv",
            "db.operation": "get",
            "deno.kv.key": JSON.parse(JSON.stringify(key)),
            "deno.kv.consistency_level": opts?.consistency ?? "strong",
          },
        });

        try {
          const result = await original.call(this, key, opts);
          span.setAttributes({
            "deno.kv.exists": result.versionstamp != null,
            "deno.kv.versionstamp": result.versionstamp ?? undefined,
          });
          span.end();
          return result;
        } catch (err) {
          span.recordException(err);
          span.end();
          throw err;
        }
      };
    };
  }

  private _patchGetMany(): (
    original: typeof Deno.Kv.prototype.getMany,
  ) => typeof Deno.Kv.prototype.getMany {
    return (original) => {
      const plugin = this;
      return async function patchGetMany(
        this: Deno.Kv,
        keys: readonly Deno.KvKey[],
        opts?: {
          consistency?: Deno.KvConsistencyLevel;
        },
      ): Promise<any> {
        const span = plugin.tracer.startSpan(`Kv getMany`, {
          kind: SpanKind.CLIENT,
          attributes: {
            "db.system": "deno-kv",
            "db.operation": "getMany",
            "deno.kv.keys": JSON.parse(JSON.stringify(keys)),
            "deno.kv.consistency_level": opts?.consistency ?? "strong",
          },
        });

        try {
          const result = await original.call(this, keys, opts);
          span.setAttributes({
            "deno.kv.keys_exist": result.map((x) => x.versionstamp !== null),
            "deno.kv.versionstamps": result.map((x) =>
              x.versionstamp ?? undefined
            ),
          });
          span.end();
          return result;
        } catch (err) {
          span.recordException(err);
          span.end();
          throw err;
        }
      };
    };
  }

  private _patchList(): (
    original: typeof Deno.Kv.prototype.list,
  ) => typeof Deno.Kv.prototype.list {
    return (original) => {
      const plugin = this;
      return function patchList(
        this: Deno.Kv,
        selector: Deno.KvListSelector,
        opts?: Deno.KvListOptions,
      ): Deno.KvListIterator<any> {
        const span = plugin.tracer.startSpan(`Kv list`, {
          kind: SpanKind.CLIENT,
          attributes: {
            "db.system": "deno-kv",
            "db.operation": "list",
            "deno.kv.consistency_level": opts?.consistency ?? "strong",
          },
        });
        for (const [k, v] of Object.entries(selector)) {
          span.setAttribute(
            `deno.kv.selector.${k}`,
            JSON.parse(JSON.stringify(v)),
          );
        }
        for (const [k, v] of Object.entries(opts ?? {})) {
          if (k == "consistency") continue;
          span.setAttribute(`deno.kv.list.${k}`, v);
        }

        try {
          const result = original.call(this, selector, opts);
          listSpans.set(result, { span, docCount: 0 });
          return result;
        } catch (err) {
          span.recordException(err);
          span.end();
          throw err;
        }
      };
    };
  }

  private _patchSet(): (
    original: typeof Deno.Kv.prototype.set,
  ) => typeof Deno.Kv.prototype.set {
    return (original) => {
      const plugin = this;
      return async function patchGet(
        this: Deno.Kv,
        key: Deno.KvKey,
        value: unknown,
      ): Promise<Deno.KvCommitResult> {
        const span = plugin.tracer.startSpan(`Kv set`, {
          kind: SpanKind.CLIENT,
          attributes: {
            "db.system": "deno-kv",
            "db.operation": "set",
            "deno.kv.key": JSON.parse(JSON.stringify(key)),
          },
        });

        try {
          const result = await original.call(this, key, value);
          span.setAttributes({
            "deno.kv.versionstamp": result.versionstamp,
          });
          span.end();
          return result;
        } catch (err) {
          span.recordException(err);
          span.end();
          throw err;
        }
      };
    };
  }

  private _patchDelete(): (
    original: typeof Deno.Kv.prototype.delete,
  ) => typeof Deno.Kv.prototype.delete {
    return (original) => {
      const plugin = this;
      return async function patchGet(
        this: Deno.Kv,
        key: Deno.KvKey,
      ): Promise<void> {
        const span = plugin.tracer.startSpan(`Kv delete`, {
          kind: SpanKind.CLIENT,
          attributes: {
            "db.system": "deno-kv",
            "db.operation": "delete",
            "deno.kv.key": JSON.parse(JSON.stringify(key)),
          },
        });

        try {
          const result = await original.call(this, key);
          span.end();
          return result;
        } catch (err) {
          span.recordException(err);
          span.end();
          throw err;
        }
      };
    };
  }

  private _patchAtomicCommit(): (
    original: typeof Deno.AtomicOperation.prototype.commit,
  ) => typeof Deno.AtomicOperation.prototype.commit {
    return (original) => {
      const plugin = this;
      return async function patchCommit(
        this: Deno.AtomicOperation,
      ): Promise<Deno.KvCommitResult | Deno.KvCommitError> {
        const span = plugin.tracer.startSpan(`Kv commit`, {
          kind: SpanKind.CLIENT,
          attributes: {
            "db.system": "deno-kv",
            "db.operation": "commit",
            // 'deno.kv.keys': key,
          },
        });

        try {
          const result = await original.call(this);
          span.end();
          return result;
        } catch (err) {
          span.recordException(err);
          span.end();
          throw err;
        }
      };
    };
  }

  private _patchListNext(): (
    original: typeof Deno.KvListIterator.prototype.next,
  ) => typeof Deno.KvListIterator.prototype.next {
    return (original) => {
      return async function patchListNext(
        this: Deno.KvListIterator<unknown>,
      ): Promise<IteratorResult<Deno.KvEntry<unknown>, undefined>> {
        const ref = listSpans.get(this);
        if (ref) {
          try {
            const result = await original.call(this);
            ref.span.end();
            return result;
          } catch (err) {
            ref.span.recordException(err);
            ref.span.end();
            throw err;
          } finally {
            listSpans.delete(this);
          }
        } else {
          return original.call(this);
        }

        // this doesn't work (span never ends) if the application does not iterate to completion:

        // try {
        //   const result = await original.call(this);
        //   if (ref) {
        //     if (result.done) {
        //       ref.span.setAttributes({
        //         'deno.kv.returned_keys': ref.docCount as number,
        //       });
        //       ref.span.end();
        //       listSpans.delete(this);
        //     } else {
        //       if (ref.docCount == 0) {
        //         ref.span.addEvent('first-result');
        //       }
        //       ref.docCount++;
        //     }
        //   }
        //   return result;
        // } catch (err) {
        //   ref?.span.recordException(err);
        //   ref?.span.end();
        //   listSpans.delete(this);
        //   throw err;
        // }
      };
    };
  }

  /**
   * implements enable function
   */
  override enable() {
    if (isWrapped(Deno.Kv.prototype["get"])) {
      this._unwrap(Deno.Kv.prototype, "get");
      this._diag.debug("removing previous patch for Kv.get");
    }
    this._wrap(Deno.Kv.prototype, "get", this._patchGet());

    if (isWrapped(Deno.Kv.prototype["getMany"])) {
      this._unwrap(Deno.Kv.prototype, "getMany");
      this._diag.debug("removing previous patch for Kv.getMany");
    }
    this._wrap(Deno.Kv.prototype, "getMany", this._patchGetMany());

    if (isWrapped(Deno.Kv.prototype["list"])) {
      this._unwrap(Deno.Kv.prototype, "list");
      this._diag.debug("removing previous patch for Kv.list");
    }
    this._wrap(Deno.Kv.prototype, "list", this._patchList());

    if (isWrapped(Deno.Kv.prototype["set"])) {
      this._unwrap(Deno.Kv.prototype, "set");
      this._diag.debug("removing previous patch for Kv.set");
    }
    this._wrap(Deno.Kv.prototype, "set", this._patchSet());

    if (isWrapped(Deno.Kv.prototype["atomic"])) {
      this._unwrap(Deno.Kv.prototype, "atomic");
      this._diag.debug("removing previous patch for Kv.atomic");
    }
    this._wrap(Deno.Kv.prototype, "atomic", this._patchAtomic());

    if (isWrapped(Deno.Kv.prototype["delete"])) {
      this._unwrap(Deno.Kv.prototype, "delete");
      this._diag.debug("removing previous patch for Kv.delete");
    }
    this._wrap(Deno.Kv.prototype, "delete", this._patchDelete());

    if (isWrapped(Deno.KvListIterator.prototype["next"])) {
      this._unwrap(Deno.KvListIterator.prototype, "next");
      this._diag.debug("removing previous patch for KvListIterator.next");
    }
    this._wrap(Deno.KvListIterator.prototype, "next", this._patchListNext());
  }

  hookAtomicOpClass() {
    if (!this.atomicOpClass) throw new Error("BUG: no atomicOpClass");
    if (isWrapped(this.atomicOpClass.prototype["commit"])) {
      this._unwrap(this.atomicOpClass.prototype, "commit");
      this._diag.debug("removing previous patch for AtomicOperation.commit");
    }
    this._wrap(
      this.atomicOpClass.prototype,
      "commit",
      this._patchAtomicCommit(),
    );

    // Once we have the AtomicOperation prototype we don't need to hook atomic() anymore
    this._unwrap(Deno.Kv.prototype, "atomic");
  }

  /**
   * implements unpatch function
   */
  override disable() {
    this._unwrap(Deno.Kv.prototype, "atomic");
    this._unwrap(Deno.Kv.prototype, "get");
    this._unwrap(Deno.Kv.prototype, "getMany");
    this._unwrap(Deno.Kv.prototype, "list");
    this._unwrap(Deno.Kv.prototype, "set");
    this._unwrap(Deno.Kv.prototype, "delete");
    this._unwrap(Deno.KvListIterator.prototype, "next");

    if (this.atomicOpClass) {
      this._unwrap(this.atomicOpClass.prototype, "commit");
    }
  }
}
