const { getDefaultConfig } = require("expo/metro-config");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const defaultConfig = getDefaultConfig(__dirname);
const config = getSentryExpoConfig(__dirname, defaultConfig);

module.exports = config;
