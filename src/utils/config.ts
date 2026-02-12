import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { HandoverConfig } from '../agent/types.js';

const GLOBAL_CONFIG_DIR = join(homedir(), '.handover');
const GLOBAL_CONFIG_PATH = join(GLOBAL_CONFIG_DIR, 'config.json');
const LOCAL_CONFIG_DIR = '.handover';
const LOCAL_CONFIG_FILE = 'config.json';

const DEFAULT_CONFIG: HandoverConfig = {
  apiKey: undefined,
  model: 'claude-sonnet-4-20250514',
  dataDir: '.handover/data',
  maxTokens: 4096,
  temperature: 0.7,
};

/**
 * Read a JSON config file, returning null if it doesn't exist or is invalid.
 */
function readConfigFile(path: string): Partial<HandoverConfig> | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as Partial<HandoverConfig>;
  } catch {
    return null;
  }
}

/**
 * Write a config object to a JSON file, creating directories as needed.
 */
function writeConfigFile(path: string, config: Partial<HandoverConfig>): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Find the local config path by walking up from cwd looking for .handover/config.json.
 * Falls back to cwd/.handover/config.json if none found.
 */
function findLocalConfigPath(): string {
  let current = process.cwd();
  const root = dirname(current);

  while (current !== root) {
    const candidate = join(current, LOCAL_CONFIG_DIR, LOCAL_CONFIG_FILE);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return join(process.cwd(), LOCAL_CONFIG_DIR, LOCAL_CONFIG_FILE);
}

/**
 * Load the merged configuration.
 * Priority: env vars > local config > global config > defaults
 */
export function loadConfig(): HandoverConfig {
  const globalConfig = readConfigFile(GLOBAL_CONFIG_PATH) ?? {};
  const localConfigPath = findLocalConfigPath();
  const localConfig = readConfigFile(localConfigPath) ?? {};

  const envOverrides: Partial<HandoverConfig> = {};
  if (process.env.ANTHROPIC_API_KEY) {
    envOverrides.apiKey = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.HANDOVER_MODEL) {
    envOverrides.model = process.env.HANDOVER_MODEL;
  }
  if (process.env.HANDOVER_DATA_DIR) {
    envOverrides.dataDir = process.env.HANDOVER_DATA_DIR;
  }
  if (process.env.HANDOVER_MAX_TOKENS) {
    envOverrides.maxTokens = parseInt(process.env.HANDOVER_MAX_TOKENS, 10);
  }
  if (process.env.HANDOVER_TEMPERATURE) {
    envOverrides.temperature = parseFloat(process.env.HANDOVER_TEMPERATURE);
  }

  return {
    ...DEFAULT_CONFIG,
    ...globalConfig,
    ...localConfig,
    ...envOverrides,
  };
}

/**
 * Save config to the local project config file.
 */
export function saveConfig(config: Partial<HandoverConfig>, global = false): void {
  const path = global ? GLOBAL_CONFIG_PATH : findLocalConfigPath();
  const existing = readConfigFile(path) ?? {};
  writeConfigFile(path, { ...existing, ...config });
}

/**
 * Get a single config value by key.
 */
export function getConfig<K extends keyof HandoverConfig>(key: K): HandoverConfig[K] {
  const config = loadConfig();
  return config[key];
}

/**
 * Set a single config value by key.
 */
export function setConfig<K extends keyof HandoverConfig>(
  key: K,
  value: HandoverConfig[K],
  global = false,
): void {
  saveConfig({ [key]: value } as Partial<HandoverConfig>, global);
}

/**
 * Get the default config values.
 */
export function getDefaults(): HandoverConfig {
  return { ...DEFAULT_CONFIG };
}
