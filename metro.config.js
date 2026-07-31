const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const youtubeiRn = path.resolve(__dirname, 'node_modules/youtubei.js/dist/src/platform/react-native.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'youtubei.js' || moduleName === 'youtubei.js/react-native') {
    return {
      filePath: youtubeiRn,
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
