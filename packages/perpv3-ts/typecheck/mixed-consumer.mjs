import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PairSnapshot, UserSetting, ValidationError } from '@synfutures/perpv3-ts';

const require = createRequire(import.meta.url);
const types = require('@synfutures/perpv3-ts/types');
assert.equal(PairSnapshot, types.PairSnapshot);
assert.equal(ValidationError, types.ValidationError);
assert.throws(() => new UserSetting({ deadlineSeconds: 60, slippageBps: 100, leverageWad: 0n }), types.ValidationError);
