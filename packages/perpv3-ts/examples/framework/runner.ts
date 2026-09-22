import { createDemoContext } from './context';
import { getDemo, listDemos, getDemoNames } from './registry';
import { closePositionIfExists, removeAllRanges } from '../utils';
import { isRpcConfig } from '@synfutures/perpv3-ts/queries';

/**
 * Options for running demos.
 */
export interface RunOptions {
    demos?: string[]; // Specific demo names to run
    category?: 'trade' | 'order' | 'range'; // Run all demos in category
    chainName?: string; // Override default chain
    signerId?: string; // Override default signer
    instrumentSymbol?: string; // Override default instrument
    skipCleanup?: boolean; // Skip cleanup after demos
    continueOnError?: boolean; // Continue if one demo fails
    skipPrerequisites?: boolean; // Skip prerequisite demos
}

/**
 * Run demos based on the provided options.
 */
export async function runDemos(options: RunOptions = {}): Promise<void> {
    const { chainName, signerId, instrumentSymbol } = options;
    if (!chainName || !signerId || !instrumentSymbol) {
        throw new Error('Running demos requires --chain, --signer and --instrument. Use --list to inspect demos.');
    }

    // Determine which demos to run
    let demosToRun: string[];
    if (options.demos && options.demos.length > 0) {
        demosToRun = options.demos;
    } else if (options.category) {
        demosToRun = listDemos(options.category).map((demo) => demo.name);
    } else {
        demosToRun = getDemoNames();
    }

    if (demosToRun.length === 0) {
        console.log('No demos found to run.');
        return;
    }

    console.log(`🚀 Running ${demosToRun.length} demo(s): ${demosToRun.join(', ')}\n`);

    // Create demo context once
    const context = await createDemoContext(chainName, signerId, instrumentSymbol);

    const results: Array<{ name: string; success: boolean; error?: Error }> = [];

    // Run each demo
    for (const demoName of demosToRun) {
        const demo = getDemo(demoName);
        if (!demo) {
            console.error(`❌ Demo "${demoName}" not found. Skipping.`);
            results.push({ name: demoName, success: false, error: new Error('Demo not found') });
            continue;
        }

        // Check prerequisites
        if (!options.skipPrerequisites && demo.prerequisites && demo.prerequisites.length > 0) {
            const missingPrereqs = demo.prerequisites.filter((prereq) => !demosToRun.includes(prereq));
            if (missingPrereqs.length > 0) {
                console.warn(
                    `⚠️  Demo "${demoName}" has prerequisites: ${missingPrereqs.join(', ')}. They may not have run yet.`
                );
            }
        }

        console.log(`=== Demo: ${demo.description || demoName} ===`);
        try {
            await demo.run(context);
            console.log(`✅ Demo "${demoName}" completed successfully!\n`);
            results.push({ name: demoName, success: true });
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error(`❌ Demo "${demoName}" failed:`, err.message);
            if (err.stack) {
                console.error(err.stack);
            }
            results.push({ name: demoName, success: false, error: err });

            if (!options.continueOnError) {
                throw err;
            }
        }
    }

    // Cleanup
    if (!options.skipCleanup) {
        console.log('🧹 Cleaning up...');
        try {
            if (!isRpcConfig(context.perpClient.config)) {
                throw new Error('Cleanup requires RPC config, but API config was provided');
            }
            await removeAllRanges(
                context.publicClient,
                context.walletClient,
                context.kit,
                context.perpClient.instrumentAddress,
                context.perpClient.config,
                context.walletAddress,
                context.perpClient.userSetting
            );
            await closePositionIfExists(
                context.publicClient,
                context.walletClient,
                context.kit,
                context.perpClient.instrumentAddress,
                context.perpClient.config,
                context.walletAddress,
                context.perpClient.userSetting
            );
            console.log('✅ Cleanup completed');
        } catch (error) {
            console.warn('⚠️  Cleanup failed:', error instanceof Error ? error.message : String(error));
        }
    }

    // Summary
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    console.log(`\n📊 Summary: ${successful} succeeded, ${failed} failed`);

    if (failed > 0 && !options.continueOnError) {
        process.exit(1);
    }
}

/**
 * List all available demos.
 */
export function listAvailableDemos(category?: string): void {
    const demos = listDemos(category);
    if (demos.length === 0) {
        console.log('No demos found.');
        return;
    }

    console.log(`\nAvailable demos${category ? ` (category: ${category})` : ''}:\n`);
    for (const demo of demos) {
        console.log(`  ${demo.name}`);
        if (demo.description) {
            console.log(`    ${demo.description}`);
        }
        if (demo.prerequisites && demo.prerequisites.length > 0) {
            console.log(`    Prerequisites: ${demo.prerequisites.join(', ')}`);
        }
        console.log('');
    }
}
