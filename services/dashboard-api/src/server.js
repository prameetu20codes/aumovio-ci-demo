'use strict';

const parseArgs = require('minimist');
const { createApp } = require('./app');
const { createStore, demoSnapshots } = require('./lib/store');

const args = parseArgs(process.argv.slice(2));
const port = Number(args.port || process.env.PORT || 3000);
const version = args.version || process.env.APP_VERSION || 'dev';

const server = createApp({ store: createStore(demoSnapshots()), version });

server.listen(port, () => {
  console.log(`dashboard-api ${version} listening on :${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
