/** Resolved CapSkip connection and polling settings. */
export interface CapSkipConfig {
  apiKey: string;
  host: string;
  port: number;
  defaultTimeout: number;
  recaptchaTimeout: number;
  pollingInterval: number;
}

/** Thrown at startup when a setting is missing or malformed. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

// CLI flag -> [config key, env var name]. The env name is carried so an
// invalid value can be reported under whichever spelling the user actually
// supplied.
const NUMERIC = {
  '--port': ['port', 'CAPSKIP_PORT'],
  '--timeout': ['defaultTimeout', 'CAPSKIP_TIMEOUT'],
  '--recaptcha-timeout': ['recaptchaTimeout', 'CAPSKIP_RECAPTCHA_TIMEOUT'],
  '--polling-interval': ['pollingInterval', 'CAPSKIP_POLLING_INTERVAL'],
} as const;

const STRING = {
  '--api-key': ['apiKey', 'CAPSKIP_API_KEY'],
  '--host': ['host', 'CAPSKIP_HOST'],
} as const;

function parseArgv(argv: string[]): Record<string, string> {
  const known = new Set([...Object.keys(NUMERIC), ...Object.keys(STRING)]);
  const out: Record<string, string> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      throw new ConfigError(`Unexpected argument '${arg}'.`);
    }

    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);

    if (!known.has(flag)) {
      throw new ConfigError(
        `Unknown option '${flag}'. Supported: ${[...known].sort().join(', ')}.`,
      );
    }

    if (eq !== -1) {
      out[flag] = arg.slice(eq + 1);
      continue;
    }

    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new ConfigError(`Option '${flag}' requires a value.`);
    }
    out[flag] = value;
    i += 1;
  }

  return out;
}

function readNumber(raw: string, label: string, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new ConfigError(`${label} must be a whole number, got '${raw}'.`);
  }
  if (value < min || value > max) {
    throw new ConfigError(`${label} must be between ${min} and ${max}, got ${value}.`);
  }
  return value;
}

/** CLI flags beat environment variables, which beat defaults. */
export function resolveConfig(argv: string[], env: NodeJS.ProcessEnv): CapSkipConfig {
  const flags = parseArgv(argv);

  const config: CapSkipConfig = {
    apiKey: 'capskip',
    host: '127.0.0.1',
    port: 8080,
    defaultTimeout: 120,
    recaptchaTimeout: 300,
    pollingInterval: 5,
  };

  for (const [flag, [key, envName]] of Object.entries(STRING)) {
    const raw = flags[flag] ?? env[envName];
    if (raw !== undefined && raw !== '') {
      config[key] = raw;
    }
  }

  const bounds: Record<string, [number, number]> = {
    port: [1, 65535],
    defaultTimeout: [1, 3600],
    recaptchaTimeout: [1, 3600],
    pollingInterval: [1, 60],
  };

  for (const [flag, [key, envName]] of Object.entries(NUMERIC)) {
    const fromFlag = flags[flag];
    const raw = fromFlag ?? env[envName];
    if (raw === undefined || raw === '') {
      continue;
    }
    const label = fromFlag !== undefined ? flag : envName;
    const [min, max] = bounds[key];
    config[key] = readNumber(raw, label, min, max);
  }

  return config;
}
