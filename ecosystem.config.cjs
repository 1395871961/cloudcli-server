module.exports = {
  apps: [
    {
      name: 'cloudcli-server',
      script: 'cmd',
      args: '/c npx tsx --tsconfig server/tsconfig.json server/index.js',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        SERVER_PORT: '3001'
      },
      watch: false,
      autorestart: true
    }
  ]
};
