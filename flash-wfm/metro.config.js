const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('es-toolkit/compat/')) {
    const subpath = moduleName.slice('es-toolkit/compat/'.length);
    const filePath = path.join(__dirname, 'node_modules', 'es-toolkit', 'compat', `${subpath}.js`);
    if (fs.existsSync(filePath)) {
      return { type: 'sourceFile', filePath };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
