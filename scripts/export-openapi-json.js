const fs = require('fs/promises');
const path = require('path');

const openApiSpec = require('../src/openapi/spec');

const outputPath = path.resolve(__dirname, '..', 'src', 'openapi', 'spec.json');

const main = async () => {
  const serialized = `${JSON.stringify(openApiSpec, null, 2)}\n`;
  await fs.writeFile(outputPath, serialized, 'utf8');
  process.stdout.write(`Saved OpenAPI JSON to ${outputPath}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
