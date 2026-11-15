const { createApp } = require('./app');

const port = Number(process.env.PORT || 3000);
createApp().listen(port, () => {
  process.stdout.write(`API listening on http://localhost:${port}\n`);
});
