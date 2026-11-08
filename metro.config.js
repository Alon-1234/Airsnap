// Learn more: https://docs.expo.dev/guides/customizing-metro/
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// This repo holds both the React Native app AND a Node.js backend in
// airsnap-server/. Metro (the app bundler) must never try to bundle the
// server code — it uses Node core modules like `path`, `http`, and
// `express` that don't exist in React Native, which crashes the bundle
// with "Unable to resolve module path". Block the whole server folder
// (and its node_modules) from Metro's module resolution + file crawl.
const existingBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : config.resolver.blockList
  ? [config.resolver.blockList]
  : [];

config.resolver.blockList = [
  ...existingBlockList,
  /[/\\]airsnap-server[/\\].*/,
];

// Web build only: react-native-maps has no browser implementation, so
// swap it for a Leaflet-based stand-in. Phones (Expo Go / native) are
// unaffected and keep using the real react-native-maps.
const WEB_SHIMS = {
  'react-native-maps': path.resolve(__dirname, 'web-shims/react-native-maps.js'),
};
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_SHIMS[moduleName]) {
    return { type: 'sourceFile', filePath: WEB_SHIMS[moduleName] };
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
