import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { deployArtifact } from '@derivation-tech/viem-kit/utils';
import type { Abi, Address, Hex } from 'viem';
import {
    concatHex,
    encodeAbiParameters,
    encodeFunctionData,
    getCreate2Address,
    http,
    isAddress,
    keccak256,
    toHex,
    createPublicClient,
    createWalletClient,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { computeExpectedStateMeta, getDevnetPaths } from './devnet-meta.js';
import { waitForRpc, buildAnvilArgs } from './anvil.js';

type JsonObject = Record<string, unknown>;

type HardhatLinkReferences = Record<
    string,
    Record<string, Array<{ start: number; length: number }>>
>;

type HardhatArtifact = {
    contractName?: string;
    abi: Abi;
    bytecode: Hex;
    linkReferences?: HardhatLinkReferences;
};

type DevnetPreset = {
    anvil: {
        host: string;
        port: number;
        chainId: number;
        mnemonic: string;
    };
    deployment: {
        trustedForwarder: Address;
        quotes: Array<{
            symbol: string;
            name: string;
            decimals: number;
            quoteParam: {
                minMarginAmountWad: string;
                tradingFeeRatio: number;
                protocolFeeRatio: number;
                qtype: number;
                tipWad: string;
            };
            quoteToUsdFeeder: {
                decimals: number;
                priceRaw: string;
            };
        }>;
        markets: Array<{
            marketType: string;
            instruments: Array<{
                baseSymbol: string;
                quoteSymbol: string;
                baseToUsdFeeder: {
                    decimals: number;
                    priceRaw: string;
                };
                initLiquidity: {
                    expiry: number;
                    tickDeltaLower: number;
                    tickDeltaUpper: number;
                    amountWad: string;
                    limitTicks: Hex;
                    deadline: number;
                };
            }>;
        }>;
    };
};

function readJsonFile(filePath: string): unknown {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
}

function assertJsonObject(value: unknown, label: string): asserts value is JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} must be a JSON object.`);
    }
}

function assertString(value: unknown, label: string): asserts value is string {
    if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
}

function assertNumber(value: unknown, label: string): asserts value is number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a number.`);
}

function parseAddress(value: unknown, label: string): Address {
    assertString(value, label);
    if (!isAddress(value)) throw new Error(`${label} must be a valid address.`);
    return value;
}

function parseHex(value: unknown, label: string): Hex {
    assertString(value, label);
    if (!value.startsWith('0x')) throw new Error(`${label} must be a 0x-prefixed hex string.`);
    return value as Hex;
}

function parseDevnetPreset(raw: unknown): DevnetPreset {
    assertJsonObject(raw, 'preset');

    const anvilRaw = raw.anvil;
    assertJsonObject(anvilRaw, 'preset.anvil');
    assertString(anvilRaw.host, 'preset.anvil.host');
    assertNumber(anvilRaw.port, 'preset.anvil.port');
    assertNumber(anvilRaw.chainId, 'preset.anvil.chainId');
    assertString(anvilRaw.mnemonic, 'preset.anvil.mnemonic');

    const deploymentRaw = raw.deployment;
    assertJsonObject(deploymentRaw, 'preset.deployment');
    const trustedForwarder = parseAddress(deploymentRaw.trustedForwarder, 'preset.deployment.trustedForwarder');

    const quotesRaw = deploymentRaw.quotes;
    if (!Array.isArray(quotesRaw)) throw new Error('preset.deployment.quotes must be an array.');
    const quotes = quotesRaw.map((quoteRaw, quoteIndex) => {
        assertJsonObject(quoteRaw, `preset.deployment.quotes[${quoteIndex}]`);
        assertString(quoteRaw.symbol, `preset.deployment.quotes[${quoteIndex}].symbol`);
        assertString(quoteRaw.name, `preset.deployment.quotes[${quoteIndex}].name`);
        assertNumber(quoteRaw.decimals, `preset.deployment.quotes[${quoteIndex}].decimals`);

        const quoteParamRaw = quoteRaw.quoteParam;
        assertJsonObject(quoteParamRaw, `preset.deployment.quotes[${quoteIndex}].quoteParam`);
        assertString(
            quoteParamRaw.minMarginAmountWad,
            `preset.deployment.quotes[${quoteIndex}].quoteParam.minMarginAmountWad`
        );
        assertNumber(
            quoteParamRaw.tradingFeeRatio,
            `preset.deployment.quotes[${quoteIndex}].quoteParam.tradingFeeRatio`
        );
        assertNumber(
            quoteParamRaw.protocolFeeRatio,
            `preset.deployment.quotes[${quoteIndex}].quoteParam.protocolFeeRatio`
        );
        assertNumber(quoteParamRaw.qtype, `preset.deployment.quotes[${quoteIndex}].quoteParam.qtype`);
        assertString(quoteParamRaw.tipWad, `preset.deployment.quotes[${quoteIndex}].quoteParam.tipWad`);

        const quoteToUsdFeederRaw = quoteRaw.quoteToUsdFeeder;
        assertJsonObject(quoteToUsdFeederRaw, `preset.deployment.quotes[${quoteIndex}].quoteToUsdFeeder`);
        assertNumber(quoteToUsdFeederRaw.decimals, `preset.deployment.quotes[${quoteIndex}].quoteToUsdFeeder.decimals`);
        assertString(quoteToUsdFeederRaw.priceRaw, `preset.deployment.quotes[${quoteIndex}].quoteToUsdFeeder.priceRaw`);

        return {
            symbol: quoteRaw.symbol,
            name: quoteRaw.name,
            decimals: quoteRaw.decimals,
            quoteParam: {
                minMarginAmountWad: quoteParamRaw.minMarginAmountWad,
                tradingFeeRatio: quoteParamRaw.tradingFeeRatio,
                protocolFeeRatio: quoteParamRaw.protocolFeeRatio,
                qtype: quoteParamRaw.qtype,
                tipWad: quoteParamRaw.tipWad,
            },
            quoteToUsdFeeder: {
                decimals: quoteToUsdFeederRaw.decimals,
                priceRaw: quoteToUsdFeederRaw.priceRaw,
            },
        };
    });

    const marketsRaw = deploymentRaw.markets;
    if (!Array.isArray(marketsRaw)) throw new Error('preset.deployment.markets must be an array.');
    const markets = marketsRaw.map((marketRaw, marketIndex) => {
        assertJsonObject(marketRaw, `preset.deployment.markets[${marketIndex}]`);
        assertString(marketRaw.marketType, `preset.deployment.markets[${marketIndex}].marketType`);

        const instrumentsRaw = marketRaw.instruments;
        if (!Array.isArray(instrumentsRaw)) {
            throw new Error(`preset.deployment.markets[${marketIndex}].instruments must be an array.`);
        }
        const instruments = instrumentsRaw.map((instrumentRaw, instrumentIndex) => {
            assertJsonObject(
                instrumentRaw,
                `preset.deployment.markets[${marketIndex}].instruments[${instrumentIndex}]`
            );
            assertString(
                instrumentRaw.baseSymbol,
                `preset.deployment.markets[${marketIndex}].instruments[${instrumentIndex}].baseSymbol`
            );
            assertString(
                instrumentRaw.quoteSymbol,
                `preset.deployment.markets[${marketIndex}].instruments[${instrumentIndex}].quoteSymbol`
            );

            const baseToUsdFeederRaw = instrumentRaw.baseToUsdFeeder;
            assertJsonObject(
                baseToUsdFeederRaw,
                `preset.deployment.markets[${marketIndex}].instruments[${instrumentIndex}].baseToUsdFeeder`
            );
            assertNumber(
                baseToUsdFeederRaw.decimals,
                `preset.deployment.markets[${marketIndex}].instruments[${instrumentIndex}].baseToUsdFeeder.decimals`
            );
            assertString(
                baseToUsdFeederRaw.priceRaw,
                `preset.deployment.markets[${marketIndex}].instruments[${instrumentIndex}].baseToUsdFeeder.priceRaw`
            );

            const initLiquidityRaw = instrumentRaw.initLiquidity;
            assertJsonObject(
                initLiquidityRaw,
                `preset.deployment.markets[${marketIndex}].instruments[${instrumentIndex}].initLiquidity`
            );
            assertNumber(
                initLiquidityRaw.expiry,
                `preset.deployment.markets[${marketIndex}].instruments[${instrumentIndex}].initLiquidity.expiry`
            );
            assertNumber(
                initLiquidityRaw.tickDeltaLower,
                `preset.deployment.markets[${marketIndex}].instruments[${instrumentIndex}].initLiquidity.tickDeltaLower`
            );
            assertNumber(
                initLiquidityRaw.tickDeltaUpper,
                `preset.deployment.markets[${marketIndex}].instruments[${instrumentIndex}].initLiquidity.tickDeltaUpper`
            );
            assertString(
                initLiquidityRaw.amountWad,
                `preset.deployment.markets[${marketIndex}].instruments[${instrumentIndex}].initLiquidity.amountWad`
            );
            const limitTicks = parseHex(
                initLiquidityRaw.limitTicks,
                `preset.deployment.markets[${marketIndex}].instruments[${instrumentIndex}].initLiquidity.limitTicks`
            );
            assertNumber(
                initLiquidityRaw.deadline,
                `preset.deployment.markets[${marketIndex}].instruments[${instrumentIndex}].initLiquidity.deadline`
            );

            return {
                baseSymbol: instrumentRaw.baseSymbol,
                quoteSymbol: instrumentRaw.quoteSymbol,
                baseToUsdFeeder: {
                    decimals: baseToUsdFeederRaw.decimals,
                    priceRaw: baseToUsdFeederRaw.priceRaw,
                },
                initLiquidity: {
                    expiry: initLiquidityRaw.expiry,
                    tickDeltaLower: initLiquidityRaw.tickDeltaLower,
                    tickDeltaUpper: initLiquidityRaw.tickDeltaUpper,
                    amountWad: initLiquidityRaw.amountWad,
                    limitTicks,
                    deadline: initLiquidityRaw.deadline,
                },
            };
        });

        return {
            marketType: marketRaw.marketType,
            instruments,
        };
    });

    return {
        anvil: {
            host: anvilRaw.host,
            port: anvilRaw.port,
            chainId: anvilRaw.chainId,
            mnemonic: anvilRaw.mnemonic,
        },
        deployment: {
            trustedForwarder,
            quotes,
            markets,
        },
    };
}

function loadArtifactFromFile(label: string, artifactPath: string): HardhatArtifact {
    const raw = readJsonFile(artifactPath);
    assertJsonObject(raw, `artifact:${label}`);

    if (!Array.isArray(raw.abi)) throw new Error(`artifact:${label}.abi must be an array.`);
    const abi = raw.abi as Abi;

    const bytecode = parseHex(raw.bytecode, `artifact:${label}.bytecode`);

    const linkReferencesRaw = raw.linkReferences;
    let linkReferences: HardhatLinkReferences | undefined;
    if (linkReferencesRaw !== undefined) {
        assertJsonObject(linkReferencesRaw, `artifact:${label}.linkReferences`);
        linkReferences = linkReferencesRaw as HardhatLinkReferences;
    }

    return {
        contractName: typeof raw.contractName === 'string' ? raw.contractName : undefined,
        abi,
        bytecode,
        linkReferences,
    };
}

function linkBytecode(bytecode: Hex, linkReferences: HardhatLinkReferences, libraries: Record<string, Address>): Hex {
    let hex = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;

    for (const fileName of Object.keys(linkReferences)) {
        const libsInFile = linkReferences[fileName];
        for (const libraryName of Object.keys(libsInFile)) {
            const address = libraries[libraryName];
            if (!address) throw new Error(`Missing library address for ${libraryName} (needed by ${fileName}).`);
            const addressHex = address.toLowerCase().slice(2);

            for (const { start, length } of libsInFile[libraryName]) {
                const startIndex = start * 2;
                const lengthHex = length * 2;
                hex = hex.slice(0, startIndex) + addressHex.padStart(lengthHex, '0') + hex.slice(startIndex + lengthHex);
            }
        }
    }

    return `0x${hex}` as Hex;
}

type InitLiquiditySeed = {
    expiry: number;
    tickDeltaLower: number;
    tickDeltaUpper: number;
    amountWad: string;
    limitTicks: Hex;
    deadline: number;
};

function encodeAddArgs(seed: InitLiquiditySeed): readonly [Hex, Hex] {
    const expiry = BigInt(seed.expiry);
    const limitTicks = BigInt(seed.limitTicks);

    const page0 = (BigInt(seed.deadline) << 80n) | (limitTicks << 32n) | expiry;

    const page1 =
        (BigInt(seed.tickDeltaLower) << 152n) |
        (BigInt(seed.tickDeltaUpper) << 128n) |
        BigInt(seed.amountWad);

    return [toHex(page0, { size: 32 }), toHex(page1, { size: 32 })] as const;
}

async function main(): Promise<void> {
    const { devnetRoot, presetPath, contractsArtifactsDir, statePath, manifestPath, metaPath } = getDevnetPaths();
    mkdirSync(devnetRoot, { recursive: true });

    const preset = parseDevnetPreset(readJsonFile(presetPath));
    const expectedMeta = computeExpectedStateMeta();

    const rpcUrl = `http://${preset.anvil.host}:${preset.anvil.port}`;

    rmSync(statePath, { force: true });
    rmSync(manifestPath, { force: true });
    rmSync(metaPath, { force: true });

    const anvilArgs = buildAnvilArgs({
        host: preset.anvil.host,
        port: preset.anvil.port,
        chainId: preset.anvil.chainId,
        mnemonic: preset.anvil.mnemonic,
        dumpStatePath: devnetRoot,
    });

    const anvil = spawn('anvil', anvilArgs, { stdio: 'inherit' });
    try {
        await waitForRpc({ rpcUrl, timeoutMs: 15_000 });

        const chain = preset.anvil.chainId === foundry.id ? foundry : { ...foundry, id: preset.anvil.chainId };
        const adminAccount = mnemonicToAccount(preset.anvil.mnemonic, { accountIndex: 0 });
        const proxyAdminAccount = mnemonicToAccount(preset.anvil.mnemonic, { accountIndex: 1 });

        const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
        const walletClient = createWalletClient({ chain, transport: http(rpcUrl), account: adminAccount });

        const artifactPaths = {
            Beacon: path.join(contractsArtifactsDir, 'contracts/Beacon.sol/Beacon.json'),
            Broker: path.join(contractsArtifactsDir, 'contracts/libraries/Broker.sol/Broker.json'),
            ChainlinkMarket: path.join(contractsArtifactsDir, 'contracts/markets/link/ChainlinkMarket.sol/ChainlinkMarket.json'),
            EmergingMarket: path.join(contractsArtifactsDir, 'contracts/markets/emg/EmergingMarket.sol/EmergingMarket.json'),
            PythMarket: path.join(contractsArtifactsDir, 'contracts/markets/pyth/PythMarket.sol/PythMarket.json'),
            DexV2Market: path.join(contractsArtifactsDir, 'contracts/markets/dexv2/DexV2Market.sol/DexV2Market.json'),
            Config: path.join(contractsArtifactsDir, 'contracts/Config.sol/Config.json'),
            Gate: path.join(contractsArtifactsDir, 'contracts/Gate.sol/Gate.json'),
            GelatoRelayRouter: path.join(
                contractsArtifactsDir,
                'contracts/GelatoRelayRouter/GelatoRelayRouter.sol/GelatoRelayRouter.json'
            ),
            Helper: path.join(contractsArtifactsDir, 'contracts/peripheral/Helper.sol/Helper.json'),
            EmergingFeederFactory: path.join(
                contractsArtifactsDir,
                'contracts/markets/emg/EmergingFeederFactory.sol/EmergingFeederFactory.json'
            ),
            Instrument: path.join(contractsArtifactsDir, 'contracts/Instrument.sol/Instrument.json'),
            InstrumentProxy: path.join(contractsArtifactsDir, 'contracts/InstrumentProxy.sol/InstrumentProxy.json'),
            LibObserver: path.join(contractsArtifactsDir, 'contracts/libraries/LibObserver.sol/LibObserver.json'),
            LibQuery: path.join(contractsArtifactsDir, 'contracts/libraries/LibQuery.sol/LibQuery.json'),
            LibPeripheral: path.join(contractsArtifactsDir, 'contracts/peripheral/lib/LibPeripheral.sol/LibPeripheral.json'),
            Liquidity: path.join(contractsArtifactsDir, 'contracts/libraries/Liquidity.sol/Liquidity.json'),
            MockChainlinkFeeder: path.join(contractsArtifactsDir, 'contracts/test/MockChainlinkFeeder.sol/MockChainlinkFeeder.json'),
            Observer: path.join(contractsArtifactsDir, 'contracts/Observer.sol/Observer.json'),
            Oyster: path.join(contractsArtifactsDir, 'contracts/libraries/Oyster.sol/Oyster.json'),
            TestToken: path.join(contractsArtifactsDir, 'contracts/test/local/TestToken.sol/TestToken.json'),
            TransparentUpgradeableProxy: path.join(
                contractsArtifactsDir,
                '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json'
            ),
            WETH: path.join(contractsArtifactsDir, 'contracts/test/local/WrappedNative.sol/WrappedNative.json'),
        } as const;

        const artifacts = {
            Beacon: loadArtifactFromFile('Beacon', artifactPaths.Beacon),
            Broker: loadArtifactFromFile('Broker', artifactPaths.Broker),
            ChainlinkMarket: loadArtifactFromFile('ChainlinkMarket', artifactPaths.ChainlinkMarket),
            EmergingMarket: loadArtifactFromFile('EmergingMarket', artifactPaths.EmergingMarket),
            PythMarket: loadArtifactFromFile('PythMarket', artifactPaths.PythMarket),
            DexV2Market: loadArtifactFromFile('DexV2Market', artifactPaths.DexV2Market),
            Config: loadArtifactFromFile('Config', artifactPaths.Config),
            Gate: loadArtifactFromFile('Gate', artifactPaths.Gate),
            GelatoRelayRouter: loadArtifactFromFile('GelatoRelayRouter', artifactPaths.GelatoRelayRouter),
            Helper: loadArtifactFromFile('Helper', artifactPaths.Helper),
            EmergingFeederFactory: loadArtifactFromFile('EmergingFeederFactory', artifactPaths.EmergingFeederFactory),
            Instrument: loadArtifactFromFile('Instrument', artifactPaths.Instrument),
            LibObserver: loadArtifactFromFile('LibObserver', artifactPaths.LibObserver),
            LibQuery: loadArtifactFromFile('LibQuery', artifactPaths.LibQuery),
            LibPeripheral: loadArtifactFromFile('LibPeripheral', artifactPaths.LibPeripheral),
            Liquidity: loadArtifactFromFile('Liquidity', artifactPaths.Liquidity),
            Observer: loadArtifactFromFile('Observer', artifactPaths.Observer),
            Oyster: loadArtifactFromFile('Oyster', artifactPaths.Oyster),
            TransparentUpgradeableProxy: loadArtifactFromFile('TransparentUpgradeableProxy', artifactPaths.TransparentUpgradeableProxy),
            InstrumentProxy: loadArtifactFromFile('InstrumentProxy', artifactPaths.InstrumentProxy),
            MockChainlinkFeeder: loadArtifactFromFile('MockChainlinkFeeder', artifactPaths.MockChainlinkFeeder),
            TestToken: loadArtifactFromFile('TestToken', artifactPaths.TestToken),
            WETH: loadArtifactFromFile('WrappedNative', artifactPaths.WETH),
        } as const;

        const deployContract = async (
            label: string,
            artifactPath: string,
            constructorArgs: readonly unknown[] = [],
            linkReferenceMap?: Record<string, Address>
        ): Promise<Address> => {
            const contractAddress = await deployArtifact(publicClient, walletClient, {
                artifact: artifactPath,
                constructorArgs: [...constructorArgs],
                linkReferenceMap,
                confirmations: 1,
            });
            return parseAddress(contractAddress, `deployment:${label}`);
        };

        const deployProxy = async (label: string, impl: Address, admin: Address, initData: Hex) => {
            return deployContract(label, artifactPaths.TransparentUpgradeableProxy, [impl, admin, initData]);
        };

        const wrappedNative = await deployContract('WrappedNative', artifactPaths.WETH);

        const quoteTokens = new Map<
            string,
            {
                address: Address;
                decimals: number;
                quoteParam: DevnetPreset['deployment']['quotes'][number]['quoteParam'];
                quoteToUsdFeeder: Address;
            }
        >();

        for (const quoteSpec of preset.deployment.quotes) {
            if (quoteTokens.has(quoteSpec.symbol)) {
                throw new Error(`Duplicate quote symbol in preset: ${quoteSpec.symbol}`);
            }
            const quoteAddress = await deployContract(`TestToken(${quoteSpec.symbol})`, artifactPaths.TestToken, [
                quoteSpec.name,
                quoteSpec.symbol,
                quoteSpec.decimals,
            ]);
            const quoteToUsdFeeder = await deployContract(
                `MockChainlinkFeeder(${quoteSpec.symbol}/USD)`,
                artifactPaths.MockChainlinkFeeder,
                [quoteSpec.quoteToUsdFeeder.decimals, BigInt(quoteSpec.quoteToUsdFeeder.priceRaw)]
            );
            quoteTokens.set(quoteSpec.symbol, {
                address: quoteAddress,
                decimals: quoteSpec.decimals,
                quoteParam: quoteSpec.quoteParam,
                quoteToUsdFeeder,
            });
        }

        const baseFeederSpecs = new Map<string, { decimals: number; priceRaw: string }>();
        for (const market of preset.deployment.markets) {
            for (const instrument of market.instruments) {
                const existing = baseFeederSpecs.get(instrument.baseSymbol);
                if (
                    existing &&
                    (existing.decimals !== instrument.baseToUsdFeeder.decimals ||
                        existing.priceRaw !== instrument.baseToUsdFeeder.priceRaw)
                ) {
                    throw new Error(
                        `Conflicting base feeder config for ${instrument.baseSymbol}. ` +
                            `Got ${JSON.stringify(instrument.baseToUsdFeeder)}, expected ${JSON.stringify(existing)}`
                    );
                }
                baseFeederSpecs.set(instrument.baseSymbol, {
                    decimals: instrument.baseToUsdFeeder.decimals,
                    priceRaw: instrument.baseToUsdFeeder.priceRaw,
                });
            }
        }

        const baseToUsdFeeders = new Map<string, Address>();
        for (const [baseSymbol, feederSpec] of baseFeederSpecs) {
            const baseToUsdFeeder = await deployContract(
                `MockChainlinkFeeder(${baseSymbol}/USD)`,
                artifactPaths.MockChainlinkFeeder,
                [feederSpec.decimals, BigInt(feederSpec.priceRaw)]
            );
            baseToUsdFeeders.set(baseSymbol, baseToUsdFeeder);
        }

        const configImpl = await deployContract('Config(impl)', artifactPaths.Config);
        const configInitData = encodeFunctionData({
            abi: artifacts.Config.abi,
            functionName: 'initialize',
            args: [adminAccount.address],
        });
        const config = await deployProxy('Config(proxy)', configImpl, proxyAdminAccount.address, configInitData);

        const handlerImpl = await deployContract(
            'GelatoRelayRouter(impl)',
            artifactPaths.GelatoRelayRouter,
            [preset.deployment.trustedForwarder]
        );
        const handlerInitData = encodeFunctionData({
            abi: artifacts.GelatoRelayRouter.abi,
            functionName: 'initialize',
            args: [],
        });
        const handler = await deployProxy('GelatoRelayRouter(proxy)', handlerImpl, proxyAdminAccount.address, handlerInitData);

        const gateImpl = await deployContract('Gate(impl)', artifactPaths.Gate, [wrappedNative, config, handler]);
        const gateInitData = encodeFunctionData({ abi: artifacts.Gate.abi, functionName: 'initialize', args: [] });
        const gate = await deployProxy('Gate(proxy)', gateImpl, proxyAdminAccount.address, gateInitData);

        const brokerLib = await deployContract('Broker(lib)', artifactPaths.Broker);
        const libQueryLib = await deployContract('LibQuery(lib)', artifactPaths.LibQuery);
        const libObserverLib = await deployContract('LibObserver(lib)', artifactPaths.LibObserver);
        const libPeripheralLib = await deployContract('LibPeripheral(lib)', artifactPaths.LibPeripheral, [], {
            LibObserver: libObserverLib,
        });
        const liquidityLib = await deployContract('Liquidity(lib)', artifactPaths.Liquidity);
        const oysterLib = await deployContract('Oyster(lib)', artifactPaths.Oyster);

        const instrumentImpl = await deployContract('Instrument(impl)', artifactPaths.Instrument, [handler], {
            Broker: brokerLib,
            LibQuery: libQueryLib,
            Liquidity: liquidityLib,
            Oyster: oysterLib,
        });

        const beacon = await deployContract('Beacon', artifactPaths.Beacon, [instrumentImpl, proxyAdminAccount.address]);

        const observer = await deployContract('Observer', artifactPaths.Observer, [gate], {
            LibObserver: libObserverLib,
            LibQuery: libQueryLib,
        });

        const helper = await deployContract('Helper', artifactPaths.Helper, [gate], {
            LibQuery: libQueryLib,
            LibPeripheral: libPeripheralLib,
        });

        const emergingFeederFactoryImpl = await deployContract('EmergingFeederFactory(impl)', artifactPaths.EmergingFeederFactory);
        const emergingFeederFactoryInitData = encodeFunctionData({
            abi: artifacts.EmergingFeederFactory.abi,
            functionName: 'initialize',
            args: [adminAccount.address, [adminAccount.address]],
        });
        const emergingFeederFactory = await deployProxy(
            'EmergingFeederFactory(proxy)',
            emergingFeederFactoryImpl,
            proxyAdminAccount.address,
            emergingFeederFactoryInitData
        );

        const quoteAddresses: Address[] = [];
        const quoteParams: Array<{
            minMarginAmount: bigint;
            tradingFeeRatio: number;
            protocolFeeRatio: number;
            qtype: number;
            tip: bigint;
        }> = [];
        for (const quoteSpec of preset.deployment.quotes) {
            const quote = quoteTokens.get(quoteSpec.symbol);
            if (!quote) throw new Error(`Missing quote token ${quoteSpec.symbol}`);
            quoteAddresses.push(quote.address);
            quoteParams.push({
                minMarginAmount: BigInt(quoteSpec.quoteParam.minMarginAmountWad),
                tradingFeeRatio: quoteSpec.quoteParam.tradingFeeRatio,
                protocolFeeRatio: quoteSpec.quoteParam.protocolFeeRatio,
                qtype: quoteSpec.quoteParam.qtype,
                tip: BigInt(quoteSpec.quoteParam.tipWad),
            });
        }

        await publicClient.waitForTransactionReceipt({
            hash: await walletClient.writeContract({
                address: config,
                abi: artifacts.Config.abi,
                functionName: 'setQuoteParam',
                args: [quoteAddresses, quoteParams],
            }),
        });

        const resolveMarketArtifact = (marketType: string) => {
            switch (marketType) {
                case 'LINK':
                    return { label: 'ChainlinkMarket', artifactPath: artifactPaths.ChainlinkMarket, abi: artifacts.ChainlinkMarket.abi };
                case 'EMG':
                    return { label: 'EmergingMarket', artifactPath: artifactPaths.EmergingMarket, abi: artifacts.EmergingMarket.abi };
                case 'PYTH':
                    return { label: 'PythMarket', artifactPath: artifactPaths.PythMarket, abi: artifacts.PythMarket.abi };
                case 'DEXV2':
                    return { label: 'DexV2Market', artifactPath: artifactPaths.DexV2Market, abi: artifacts.DexV2Market.abi };
                default:
                    throw new Error(`Unsupported marketType in preset: ${marketType}`);
            }
        };

        const markets = new Map<string, { address: Address; abi: Abi }>();
        for (const marketSpec of preset.deployment.markets) {
            const { label, artifactPath, abi } = resolveMarketArtifact(marketSpec.marketType);
            const marketImpl = await deployContract(`${label}(impl:${marketSpec.marketType})`, artifactPath, [config, gate]);
            let initData: Hex = '0x';
            if (marketSpec.marketType === 'DEXV2') {
                initData = encodeFunctionData({ abi, functionName: 'initialize', args: [[]] });
            }
            const market = await deployProxy(`${label}(proxy:${marketSpec.marketType})`, marketImpl, proxyAdminAccount.address, initData);
            markets.set(marketSpec.marketType, { address: market, abi });
        }

        for (const [marketType, market] of markets) {
            await publicClient.waitForTransactionReceipt({
                hash: await walletClient.writeContract({
                    address: config,
                    abi: artifacts.Config.abi,
                    functionName: 'setMarketInfo',
                    args: [marketType, market.address, beacon],
                }),
            });
        }

        const requiredQuoteQuantityBySymbol = new Map<string, bigint>();
        for (const marketSpec of preset.deployment.markets) {
            for (const instrumentSpec of marketSpec.instruments) {
                const quote = quoteTokens.get(instrumentSpec.quoteSymbol);
                if (!quote) throw new Error(`Unknown quoteSymbol ${instrumentSpec.quoteSymbol} in preset`);

                const quoteDecimals = BigInt(quote.decimals);
                if (quoteDecimals > 18n) {
                    throw new Error(`Unsupported quote decimals > 18 for ${instrumentSpec.quoteSymbol}: ${quoteDecimals}`);
                }
                const scaler = 10n ** (18n - quoteDecimals);
                const requiredQuantity = (BigInt(instrumentSpec.initLiquidity.amountWad) + scaler - 1n) / scaler;

                requiredQuoteQuantityBySymbol.set(
                    instrumentSpec.quoteSymbol,
                    (requiredQuoteQuantityBySymbol.get(instrumentSpec.quoteSymbol) ?? 0n) + requiredQuantity
                );
            }
        }

        for (const [quoteSymbol, requiredQuantity] of requiredQuoteQuantityBySymbol) {
            const quote = quoteTokens.get(quoteSymbol);
            if (!quote) throw new Error(`Unknown quoteSymbol ${quoteSymbol} in preset`);

            const mintQuantity = requiredQuantity * 100n;

            await publicClient.waitForTransactionReceipt({
                hash: await walletClient.writeContract({
                    address: quote.address,
                    abi: artifacts.TestToken.abi,
                    functionName: 'mint',
                    args: [adminAccount.address, mintQuantity],
                }),
            });

            await publicClient.waitForTransactionReceipt({
                hash: await walletClient.writeContract({
                    address: quote.address,
                    abi: artifacts.TestToken.abi,
                    functionName: 'approve',
                    args: [gate, mintQuantity],
                }),
            });
        }

        const instrumentProxyInitCode = concatHex([
            artifacts.InstrumentProxy.bytecode,
            encodeAbiParameters([{ type: 'address' }], [beacon]),
        ]);
        const instrumentProxyBytecodeHash = keccak256(instrumentProxyInitCode);

        const instruments: Array<{
            marketType: string;
            baseSymbol: string;
            quoteSymbol: string;
            quote: Address;
            address: Address;
            index: Hex;
            expiry: number;
            symbol: string;
        }> = [];

        for (const marketSpec of preset.deployment.markets) {
            const market = markets.get(marketSpec.marketType);
            if (!market) throw new Error(`Missing market deployment for ${marketSpec.marketType}`);

            for (const instrumentSpec of marketSpec.instruments) {
                const quote = quoteTokens.get(instrumentSpec.quoteSymbol);
                if (!quote) throw new Error(`Unknown quoteSymbol ${instrumentSpec.quoteSymbol} in preset`);
                const baseToUsdFeeder = baseToUsdFeeders.get(instrumentSpec.baseSymbol);
                if (!baseToUsdFeeder) throw new Error(`Missing base feeder for ${instrumentSpec.baseSymbol}`);

                const index = keccak256(
                    encodeAbiParameters(
                        [{ type: 'string' }, { type: 'string' }, { type: 'address' }],
                        [marketSpec.marketType, instrumentSpec.baseSymbol, quote.address]
                    )
                );

                const instrument = getCreate2Address({
                    from: gate,
                    salt: index,
                    bytecodeHash: instrumentProxyBytecodeHash,
                });

                const quoteToUsdFeeder = quote.quoteToUsdFeeder;
                const ftype = quote.quoteParam.qtype === 1 ? 1 : 0; // QuoteType.STABLE -> FeederType.QUOTE_STABLE
                const priceFeeder = {
                    ftype,
                    scaler0: 0n,
                    aggregator0: baseToUsdFeeder,
                    heartBeat0: 16_777_215,
                    scaler1: 0n,
                    aggregator1: quoteToUsdFeeder,
                    heartBeat1: 16_777_215,
                } as const;

                await publicClient.waitForTransactionReceipt({
                    hash: await walletClient.writeContract({
                        address: market.address,
                        abi: market.abi,
                        functionName: 'setFeeder',
                        args: [[instrument], [priceFeeder]],
                    }),
                });

                const launchData = encodeAbiParameters(
                    [{ type: 'string' }, { type: 'address' }],
                    [instrumentSpec.baseSymbol, quote.address]
                );
                const addArgs = encodeAddArgs(instrumentSpec.initLiquidity);

                await publicClient.waitForTransactionReceipt({
                    hash: await walletClient.writeContract({
                        address: gate,
                        abi: artifacts.Gate.abi,
                        functionName: 'launch',
                        args: [marketSpec.marketType, instrument, launchData, addArgs],
                    }),
                });

                instruments.push({
                    marketType: marketSpec.marketType,
                    baseSymbol: instrumentSpec.baseSymbol,
                    quoteSymbol: instrumentSpec.quoteSymbol,
                    quote: quote.address,
                    address: instrument,
                    index,
                    expiry: instrumentSpec.initLiquidity.expiry,
                    symbol: `${instrumentSpec.baseSymbol}-${instrumentSpec.quoteSymbol}-${marketSpec.marketType}`,
                });
            }
        }

        if (instruments.length < 1) {
            throw new Error('No instruments were deployed. Add at least one instrument to preset.deployment.markets.');
        }

        const manifest = {
            chainId: preset.anvil.chainId,
            rpcUrl,
            contractsPackage: { name: expectedMeta.contractsPackageName, version: expectedMeta.contractsPackageVersion },
            accounts: { admin: { address: adminAccount.address }, proxyAdmin: { address: proxyAdminAccount.address } },
            contracts: {
                config,
                gate,
                observer,
                handler,
                beacon,
                helper,
                emergingFeederFactory,
                markets: Object.fromEntries(Array.from(markets, ([marketType, { address }]) => [marketType, address])),
            },
            tokens: {
                wrappedNative,
                quotes: Object.fromEntries(Array.from(quoteTokens, ([symbol, info]) => [symbol, { address: info.address, decimals: info.decimals }])),
            },
            feeders: {
                baseToUsd: Object.fromEntries(Array.from(baseToUsdFeeders, ([symbol, address]) => [symbol, address])),
                quoteToUsd: Object.fromEntries(Array.from(quoteTokens, ([symbol, info]) => [symbol, info.quoteToUsdFeeder])),
            },
            libraries: { Broker: brokerLib, LibQuery: libQueryLib, Liquidity: liquidityLib, Oyster: oysterLib, LibObserver: libObserverLib },
            instruments,
            defaults: {
                instrument: {
                    marketType: instruments[0].marketType,
                    baseSymbol: instruments[0].baseSymbol,
                    quoteSymbol: instruments[0].quoteSymbol,
                    address: instruments[0].address,
                    expiry: instruments[0].expiry,
                },
            },
        } as const;

        const meta = {
            ...expectedMeta,
            generatedAt: new Date().toISOString(),
        } as const;

        anvil.kill('SIGINT');
        await new Promise<void>((resolve, reject) => {
            anvil.once('exit', (code) => {
                if (code === 0 || code === null) resolve();
                else reject(new Error(`Anvil exited with code ${code}`));
            });
        });

        if (!existsSync(statePath)) {
            throw new Error(`Anvil exited but did not write state file at ${statePath}`);
        }

        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);
        writeFileSync(metaPath, `${JSON.stringify(meta, null, 4)}\n`);

        process.stdout.write(`Devnet regenerated:\n- ${statePath}\n- ${manifestPath}\n- ${metaPath}\n`);
    } finally {
        if (!anvil.killed) anvil.kill('SIGKILL');
    }
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
});
