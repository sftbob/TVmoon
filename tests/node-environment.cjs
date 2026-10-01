const path = require('path');
const NodeEnvironment = require(require.resolve('jest-environment-node', {
  paths: [path.dirname(require.resolve('jest'))],
}));

// Jest 27 predates Node's native fetch/WebCrypto globals used by Edge routes.
module.exports = class EdgeEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
    for (const name of [
      'Request',
      'Response',
      'Headers',
      'TextEncoder',
      'TextDecoder',
      'ReadableStream',
    ]) {
      this.global[name] = globalThis[name];
    }
  }
};
