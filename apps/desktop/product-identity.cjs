const path = require('node:path');

const stableName = 'Capy Terminal';
const devName = 'Capy Terminal Dev';

function initialize(app, args) {
  app.setName(stableName);
  const override = args.find(arg => arg.startsWith('--user-data-dir='));
  const directory = override ? path.resolve(override.slice(16)) : path.join(app.getPath('appData'), stableName);
  app.setPath('userData', directory);
  app.setPath('sessionData', directory);
}

function display(app, dev) {
  const name = dev ? 'Jetstream Dev' : 'Jetstream';
  app.setName(name);
  app.setAboutPanelOptions({applicationName:name});
  return name;
}

module.exports = {initialize, display, stableName, devName};
