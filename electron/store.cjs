const Store = require('electron-store');

const store = new Store({
  name: 'cloudcli-config',
  defaults: {
    serverUrl: 'https://cloudcli-server.onrender.com',
    token: '',
    signalingToken: '',
    signalingUsername: '',
    connectionMode: 'online',
    deviceId: '',
    deviceName: '',
    autoStart: true,
    minimizeToTray: true,
  },
  schema: {
    serverUrl: { type: 'string' },
    token: { type: 'string' },
    signalingToken: { type: 'string' },
    signalingUsername: { type: 'string' },
    connectionMode: { type: 'string', enum: ['online', 'lan', 'offline'] },
    deviceId: { type: 'string' },
    deviceName: { type: 'string' },
    autoStart: { type: 'boolean' },
    minimizeToTray: { type: 'boolean' },
  }
});

module.exports = store;
