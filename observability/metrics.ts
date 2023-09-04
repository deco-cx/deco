import { register, Registry } from "https://esm.sh/prom-client@14.2.0";

// required configuration
const influxUsr = Deno.env.get("OBS_INFLUX_USR");
const influxPasswd = Deno.env.get("OBS_INFLUX_PASSWD");
const influxHost = Deno.env.get("OBS_INFLUX_HOST");
// check if should collect or not
const shouldCollectMetrics = !!influxPasswd && !!influxUsr && !!influxHost;
// optional configuration
const influxProtocol = Deno.env.get("OBS_INFLUX_PROTOCOL") ?? "https";
const influxPort = Deno.env.get("OBS_INFLUX_PORT");
const influxWriteEndpoint = Deno.env.get("OBS_INFLUX_WRITE_ENDPOINT") ??
    "/api/v1/push/influx/write";

const metricsCollectIntervalFromEnv = Deno.env.get(
    "OBS_COLLECT_METRICS_INTERVAL_MS",
);
const metricsCollectInterval = metricsCollectIntervalFromEnv
    ? +metricsCollectIntervalFromEnv
    : 30_000;

const writeApiUrl =
    `${influxProtocol}://${influxUsr}:${influxPasswd}@${influxHost}${influxPort ? `:${influxPort}` : ""
    }${influxWriteEndpoint}?precision=ns`;

const registries: Registry[] = [register];
function formatTags(tags: Record<string, string | number>) {
    return Object.entries(tags).map(([key, value]) => `${key}=${value}`).join(
        ",",
    );
}

function formatFields(fields: Record<string, string | number>) {
    return Object.entries(fields).map(([key, value]) => `${key}=${value}`)
        .join(",");
}

export const withRegistry = (registry: Registry) => registries.push(registry);

export const collectPromMetrics = () => {
    if (!shouldCollectMetrics) {
        console.warn("influx is not configured to collect metrics");
        return;
    }
    setInterval(
        async () => {
            // send metric data to InfluxDB
            for (const register of registries) {
                for (const value of await register.getMetricsAsJSON()) {
                    const dataPoints = Object.values(value.values).map((
                        metricVal,
                    ) => {
                        const metricName =
                            (metricVal as { metricName?: string }).metricName;
                        const name = metricName
                            ? metricName.substring(value.name.length + 1)
                            : value.aggregator;
                        return ({
                            measurement: value.name,
                            tags: {
                                metric_type: value.type,
                                metric_name: value.aggregator,
                                ...metricVal.labels,
                            },
                            fields: {
                                [name]: metricVal.value,
                            },
                            timestamp: Date.now() * 1000000,
                        });
                    });

                    const body = dataPoints.map((point) =>
                        `${point.measurement},${formatTags(point.tags)} ${formatFields(point.fields)
                        } ${point.timestamp}`
                    ).join("\n");

                    await fetch(writeApiUrl, {
                        method: "POST",
                        headers: {
                            "Content-Type": "text/plain",
                        },
                        body,
                    }).catch((err) => console.log(err));
                }
            }
        },
        metricsCollectInterval,
    );
};