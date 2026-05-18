const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const SCHEMA_PATH = path.resolve('./src/environments/environment.schema.ts');
const OUTPUT_PATH = path.resolve('./src/environments/environment.generated.ts');

const toEnvName = (prefix, fieldName) =>
  `${prefix}${fieldName.replace(/[A-Z]/g, '_$&').toUpperCase()}`;

const loadSchema = () => {
  const source = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });

  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require,
  });

  new vm.Script(outputText, { filename: SCHEMA_PATH }).runInContext(context);

  const { ENV_PREFIX, ENV_SCHEMA } = module.exports;

  if (typeof ENV_PREFIX !== 'string') {
    throw new Error('ENV_PREFIX must be a string in environment.schema.ts');
  }

  if (!ENV_SCHEMA || typeof ENV_SCHEMA !== 'object') {
    throw new Error('ENV_SCHEMA must be an object in environment.schema.ts');
  }

  return { ENV_PREFIX, ENV_SCHEMA };
};

const buildEnvironment = () => {
  const { ENV_PREFIX, ENV_SCHEMA } = loadSchema();
  const missingRequired = [];

  const entries = Object.entries(ENV_SCHEMA).map(([fieldName, config]) => {
    const envName = toEnvName(ENV_PREFIX, fieldName);
    const hasEnvValue = Object.prototype.hasOwnProperty.call(process.env, envName);
    const isRequired = config.default === null;
    const value = hasEnvValue ? process.env[envName] : (config.default ?? '');

    if (isRequired && !hasEnvValue) {
      missingRequired.push(envName);
    }

    return [fieldName, value];
  });

  if (missingRequired.length > 0) {
    throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
  }

  return Object.fromEntries(entries);
};

const environment = buildEnvironment();

const generatedSource = [
  "import type { Environment } from './environment.schema';",
  '',
  `export const environmentGenerated: Partial<Environment> = ${JSON.stringify(environment, null, 2)};`,
  '',
].join('\n');

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, generatedSource);
console.log('environment.generated.ts generated');
