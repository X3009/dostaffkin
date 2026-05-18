export const ENV_PREFIX = 'DOSTAFFKIN_';

export const ENV_SCHEMA = {
  googleMapsApiKey: {
    default: null,
  },
  deliveriesApiUrl: {
    default: null,
  },
} as const;

export type Environment = {
  [K in keyof typeof ENV_SCHEMA]: string;
};
