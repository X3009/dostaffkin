import { ENV_SCHEMA, type Environment } from './environment.schema';
import { environmentGenerated } from './environment.generated';

const schemaEntries = Object.entries(ENV_SCHEMA) as Array<[
  keyof Environment,
  (typeof ENV_SCHEMA)[keyof Environment],
]>;

const defaults = Object.fromEntries(
  schemaEntries.map(([key, config]) => [key, config.default ?? ''])
) as Environment;

export const environment: Environment = {
  ...defaults,
  ...environmentGenerated,
};
