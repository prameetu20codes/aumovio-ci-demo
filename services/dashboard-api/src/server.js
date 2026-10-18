'use strict';

const { createApp } = require('./app');
const { createStore, demoSnapshots } = require('./lib/store');

const port = Number(process.env.PORT || 3000);
const version = process.env.APP_VERSION || 'dev';

const server = createApp({ store: createStore(demoSnapshots()), version });

server.listen(port, () => {
  console.log(`dashboard-api ${version} listening on :${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
