#!/usr/bin/env node

/**
 * Main entry point for running demos.
 *
 * Usage:
 *   npm run demo                           # Run all demos
 *   npm run demo trade-by-margin           # Run specific demo
 *   npm run demo trade-by-margin adjust-margin  # Run multiple demos
 *   npm run demo -- --category trade       # Run all demos in category
 *   npm run demo -- --chain base --signer alice --instrument ETH-USDC
 */

import * as dotenv from 'dotenv';
import { runDemos, listAvailableDemos } from './framework/runner';

// Import demo modules to register them
import './trade';
import './order';
import './range';

// Parse command line arguments
const args = process.argv.slice(2);

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Demo Runner

Usage:
  npm run demo [options] [demo-names...]

Options:
  --category <category>     Run all demos in category (trade, order, range)
  --chain <chain>          Chain name (required)
  --signer <signer>         Signer ID (required)
  --instrument <symbol>    Instrument symbol (required)
  --skip-cleanup           Skip cleanup after demos
  --continue-on-error      Continue running if one demo fails
  --skip-prerequisites      Skip prerequisite demos
  --list                   List all available demos
  --help, -h                Show this help message

Examples:
  npm run demo                                    # Run all demos
  npm run demo trade-by-margin                    # Run specific demo
  npm run demo trade-by-margin adjust-margin      # Run multiple demos
  npm run demo -- --category trade                # Run all trade demos
  npm run demo -- --list                          # List all demos
  npm run demo -- --chain base --signer alice --instrument ETH-USDC  # Override defaults
`);
    process.exit(0);
}

// Check for list flag
if (args.includes('--list')) {
    const categoryArg = args.indexOf('--category');
    const category = categoryArg !== -1 && args[categoryArg + 1] ? args[categoryArg + 1] : undefined;
    listAvailableDemos(category as 'trade' | 'order' | 'range' | undefined);
    process.exit(0);
}

// Parse options
const options: Parameters<typeof runDemos>[0] = {};

// Extract category
const categoryIndex = args.indexOf('--category');
if (categoryIndex !== -1 && args[categoryIndex + 1]) {
    options.category = args[categoryIndex + 1] as 'trade' | 'order' | 'range';
    args.splice(categoryIndex, 2);
}

// Extract chain
const chainIndex = args.indexOf('--chain');
if (chainIndex !== -1 && args[chainIndex + 1]) {
    options.chainName = args[chainIndex + 1];
    args.splice(chainIndex, 2);
}

// Extract signer
const signerIndex = args.indexOf('--signer');
if (signerIndex !== -1 && args[signerIndex + 1]) {
    options.signerId = args[signerIndex + 1];
    args.splice(signerIndex, 2);
}

// Extract instrument
const instrumentIndex = args.indexOf('--instrument');
if (instrumentIndex !== -1 && args[instrumentIndex + 1]) {
    options.instrumentSymbol = args[instrumentIndex + 1];
    args.splice(instrumentIndex, 2);
}

// Extract flags
if (args.includes('--skip-cleanup')) {
    options.skipCleanup = true;
    args.splice(args.indexOf('--skip-cleanup'), 1);
}

if (args.includes('--continue-on-error')) {
    options.continueOnError = true;
    args.splice(args.indexOf('--continue-on-error'), 1);
}

if (args.includes('--skip-prerequisites')) {
    options.skipPrerequisites = true;
    args.splice(args.indexOf('--skip-prerequisites'), 1);
}

// Remaining args are demo names
if (args.length > 0) {
    options.demos = args;
}

// Load signer configuration only for explicit execution.
dotenv.config();

// Run demos
runDemos(options)
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Demo runner failed:', error);
        process.exit(1);
    });
