'use strict';

const path = require('node:path');
const { existsSync } = require('node:fs');

const target = path.resolve(__dirname, '../../rust/target');
const profile = process.env.AOLINKS_NATIVE_PROFILE === 'release' ? 'release' : 'debug';
const nativeCandidates = [path.join(target, profile, 'aolinks_engine.node')];
const nativePath = nativeCandidates.find(existsSync);
if (!nativePath) {
  throw new Error('AoLinks Rust engine is not built. Run scripts/build-native.ps1 before starting Slink.');
}

const native = require(nativePath);

function runDryRun(workflow, event) {
  try {
    return JSON.parse(native.runDryRun(JSON.stringify(workflow), JSON.stringify(event)));
  } catch (error) {
    if (error.code === 'InvalidArg') {
      error.statusCode = 400;
      error.code = 'workflow_validation_error';
    }
    throw error;
  }
}

module.exports = { runDryRun };
