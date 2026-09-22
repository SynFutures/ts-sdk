export type InstrumentForCallArgumentLayout = 'traderThenParam' | 'paramOnly';
export type InstrumentPackedParamCodec = 'add' | 'remove' | 'trade' | 'place' | 'batchPlace' | 'fill' | 'cancel';

export type InstrumentOperationCallMetadata<TFunctionName extends string = string> = {
    functionName: TFunctionName;
    label: TFunctionName;
};

export type InstrumentOperationForCallMetadata<TFunctionName extends string = string> =
    InstrumentOperationCallMetadata<TFunctionName> & {
        argumentLayout: InstrumentForCallArgumentLayout;
    };

export type InstrumentOperationParamMetadata =
    | {
          kind: 'packedTuple';
          codec: Exclude<InstrumentPackedParamCodec, 'fill' | 'cancel'>;
          tupleSize: 2 | 3;
          parserArgLabel: 'args';
      }
    | {
          kind: 'packedArg';
          codec: Extract<InstrumentPackedParamCodec, 'fill' | 'cancel'>;
          parserArgLabel: 'arg';
      }
    | {
          kind: 'structuredArgs';
          parserArgLabel: 'args';
      };

const direct = <const TFunctionName extends string>(
    functionName: TFunctionName
): InstrumentOperationCallMetadata<TFunctionName> => ({ functionName, label: functionName });

const forCall = <const TFunctionName extends string>(
    functionName: TFunctionName,
    argumentLayout: InstrumentForCallArgumentLayout
): InstrumentOperationForCallMetadata<TFunctionName> => ({ functionName, label: functionName, argumentLayout });

const multicall = () => direct('multicall');
const routerBatch = () => direct('batchMulticall');
const packedTuple = <const TCodec extends Exclude<InstrumentPackedParamCodec, 'fill' | 'cancel'>>(
    codec: TCodec,
    tupleSize: 2 | 3
): Extract<InstrumentOperationParamMetadata, { kind: 'packedTuple' }> & { codec: TCodec } => ({
    kind: 'packedTuple',
    codec,
    tupleSize,
    parserArgLabel: 'args',
});
const packedArg = <const TCodec extends Extract<InstrumentPackedParamCodec, 'fill' | 'cancel'>>(
    codec: TCodec
): Extract<InstrumentOperationParamMetadata, { kind: 'packedArg' }> & { codec: TCodec } => ({
    kind: 'packedArg',
    codec,
    parserArgLabel: 'arg',
});
const structuredArgs = (): Extract<InstrumentOperationParamMetadata, { kind: 'structuredArgs' }> => ({
    kind: 'structuredArgs',
    parserArgLabel: 'args',
});

export const INSTRUMENT_OPERATION_METADATA = {
    marketOrder: {
        param: packedTuple('trade', 2),
        write: {
            direct: direct('trade'),
            forCall: forCall('tradeFor', 'traderThenParam'),
            routerBatch: routerBatch(),
        },
    },
    limitOrder: {
        param: packedTuple('place', 2),
        write: {
            direct: direct('place'),
            forCall: forCall('placeFor', 'traderThenParam'),
        },
    },
    cancelOrder: {
        param: packedArg('cancel'),
        write: {
            direct: direct('cancel'),
            forCall: forCall('cancelFor', 'traderThenParam'),
            multicall: multicall(),
            routerBatch: routerBatch(),
        },
    },
    adjustMargin: {
        param: packedTuple('trade', 2),
        write: {
            direct: direct('trade'),
            forCall: forCall('tradeFor', 'traderThenParam'),
            routerBatch: routerBatch(),
        },
    },
    batchPlaceScaledLimitOrder: {
        param: packedTuple('batchPlace', 3),
        write: {
            direct: direct('batchPlace'),
            forCall: forCall('batchPlaceFor', 'traderThenParam'),
            routerBatch: routerBatch(),
        },
    },
    crossLimitOrder: {
        param: structuredArgs(),
        write: {
            trade: {
                direct: direct('trade'),
                forCall: forCall('tradeFor', 'traderThenParam'),
            },
            place: {
                direct: direct('place'),
                forCall: forCall('placeFor', 'traderThenParam'),
            },
            multicall: multicall(),
            routerBatch: routerBatch(),
        },
    },
    fillLimitOrder: {
        param: packedArg('fill'),
        write: {
            direct: direct('fill'),
        },
    },
    addLiquidity: {
        param: packedTuple('add', 2),
        write: {
            direct: direct('add'),
            forCall: forCall('addFor', 'traderThenParam'),
            routerBatch: routerBatch(),
        },
    },
    removeLiquidity: {
        param: packedTuple('remove', 2),
        write: {
            direct: direct('remove'),
            forCall: forCall('removeFor', 'paramOnly'),
            routerBatch: routerBatch(),
        },
    },
    settle: {
        param: structuredArgs(),
        write: {
            direct: direct('settle'),
        },
    },
} as const;

export type InstrumentOperationName = keyof typeof INSTRUMENT_OPERATION_METADATA;
