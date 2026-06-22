// Learn more: https://docs.expo.dev/guides/customizing-metro/
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

module.exports = config;
