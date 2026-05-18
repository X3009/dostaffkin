const fs = require('fs');

const key = process.env.GOOGLE_MAPS_API_KEY || '';

fs.mkdirSync('./src/environments', { recursive: true });
fs.writeFileSync(
  './src/environments/environment.ts',
  `export const environment = {\n  googleMapsApiKey: '${key}'\n};\n`
);
console.log('environment.ts generated');
