// v5 modules consumed by the pinned parser and formatting helpers.
const units = require('@ethersproject/units');
const { hexDataSlice } = require('@ethersproject/bytes');
const { isAddress } = require('@ethersproject/address');
exports.BigNumber = require('@ethersproject/bignumber').BigNumber;
exports.ethers = { utils: { ...units, hexDataSlice, isAddress } };
