const { createApp } = require('./src/app');
const { loadDotEnv } = require('./src/dotenv');
const packageJson = require('../package.json');

loadDotEnv();
const port = Number(process.env.ML_SERVICE_PORT || 4765);

const server = createApp();
server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({
    evt: 'service-started',
    service: 'onframe',
    version: packageJson.version,
    url: `http://127.0.0.1:${port}`
  }));
});
