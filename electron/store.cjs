const Store = require('electron-store');

const store = new Store({
  name: 'cloudcli-config',
  defaults: {
    serverUrl: '',
    token: '',
    deviceId: '',
    deviceName: '',
    autoStart: true,
    minimizeToTray: true,
  },
  schema: {
    serverUrl: { type: 'string' },
    token: { type: 'string' },
    deviceId: { type: 'string' },
    deviceName: { type: 'string' },
    autoStart: { type: 'boolean' },
    minimizeToTray: { type: 'boolean' },
  }
});

module.exports = store;
