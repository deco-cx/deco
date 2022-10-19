import type { DecoManifest, LiveOptions } from "./types.ts";

type EnhancedLiveOptions = LiveOptions & { siteId?: number };

class LiveContext {
  // While Fresh doesn't allow for injecting routes and middlewares,
  // we have to deliberately store the manifest in this scope.
  #manifest: DecoManifest;
  #liveOptions: EnhancedLiveOptions;
  #defaultDomains: string[];
  #deploymentId: string | undefined;
  #loginUrl = "/login";
  #isDenoDeploy: boolean;

  constructor() {
    this.#deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");
    this.#isDenoDeploy = this.#deploymentId !== undefined;
    this.#defaultDomains = ["localhost"];
  }

  public setupManifestAndOptions({ manifest, liveOptions }: {
    manifest: DecoManifest;
    liveOptions: EnhancedLiveOptions;
  }) {
    if (!this.#manifest) {
      this.setManifest(manifest);
    }

    if (!this.#liveOptions) {
      this.setLiveOptions(liveOptions);
    }
  }

  public getDefaultDomains() {
    return this.#defaultDomains;
  }

  public pushDefaultDomains(...domains: string[]) {
    this.#defaultDomains.push(...domains);
  }

  public isPrivateDomain(domain: string) {
    return this.#defaultDomains.includes(domain);
  }

  public getManifest() {
    return this.#manifest;
  }

  public setManifest(manifest: DecoManifest) {
    this.#manifest = manifest;
  }

  public getLiveOptions() {
    return this.#liveOptions;
  }

  public setLiveOptions(liveOptions: EnhancedLiveOptions) {
    this.#liveOptions = liveOptions;
  }

  public getDeploymentId() {
    return this.#deploymentId;
  }

  public getLoginUrl() {
    return this.#loginUrl;
  }

  public isDenoDeploy() {
    return this.#isDenoDeploy;
  }
}

const liveContext: LiveContext = new LiveContext();

export default liveContext;
