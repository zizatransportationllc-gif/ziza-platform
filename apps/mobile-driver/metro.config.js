// Metro config — Expo SDK 51 + Firebase 10 (Sprint 66).
// Firebase 10 ships .cjs entrypoints that Metro's package-exports resolution
// mishandles ("Component auth has not been registered yet"). Disabling package
// exports and adding the .cjs source extension is the documented workaround.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push("cjs");
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
