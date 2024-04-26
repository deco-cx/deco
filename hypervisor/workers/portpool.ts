import {
  checkedPort,
  makeRange,
  max,
  min,
} from "https://deno.land/x/getport@v2.1.2/mod.ts";

class PortPool implements PortPool {
  private usedPorts: Set<number>;
  private minPort: number;
  private maxPort: number;

  constructor(minPort: number = 10303, maxPort: number = 10503) {
    if (
      minPort < min || minPort > max || maxPort < min || maxPort > max ||
      minPort >= maxPort
    ) {
      throw new Error("Invalid port range");
    }
    this.minPort = minPort;
    this.maxPort = maxPort;
    this.usedPorts = new Set<number>();
  }

  get(): number {
    const availablePorts = this.generateAvailablePorts();
    if (availablePorts.length === 0) {
      throw new Error("No available ports in the pool");
    }
    const port = availablePorts.pop();
    if (!port) {
      throw new Error("there's no available port");
    }
    this.usedPorts.add(port);
    return port;
  }

  free(port: number) {
    this.usedPorts.delete(port);
  }

  private generateAvailablePorts(): number[] {
    const allPorts = makeRange(this.minPort, this.maxPort);
    const availablePorts = allPorts.filter((port) => {
      const result: checkedPort = this.checkPort({ port });
      return result.valid && !this.usedPorts.has(port);
    });
    return availablePorts;
  }

  private checkPort(options: Deno.ListenOptions): checkedPort {
    const { port } = options;
    try {
      const server = Deno.listen(options);
      server.close();
      return { valid: true, port };
    } catch (e) {
      if (e.name !== "AddrInUse") throw e;
      else return { valid: false, port };
    }
  }
}

export default PortPool;

export const portPool = new PortPool();
