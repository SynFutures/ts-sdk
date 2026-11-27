/**
 * Error codes for programmatic error handling
 */
export enum ErrorCode {
    // Validation errors (1000-1999)
    INVALID_DEADLINE = 1001,
    INVALID_SLIPPAGE = 1002,
    INVALID_LEVERAGE = 1003,
    INVALID_TICK = 1004,
    INVALID_SIZE = 1005,
    INVALID_AMOUNT = 1006,
    INVALID_PARAM = 1007,

    // Simulation errors (2000-2999)
    SIMULATION_FAILED = 2001,
    MISSING_MARK_PRICE = 2002,
    MISSING_QUOTATION = 2003,
    MISSING_POSITION = 2004,
    INSUFFICIENT_MARGIN = 2005,
    MISSING_AMM = 2006,

    // Calculation errors (3000-3999)
    CALCULATION_FAILED = 3001,
    OVERFLOW = 3002,
    INVALID_KEY = 3003,

    // Encoding errors (4000-4999)
    ENCODING_FAILED = 4001,
    INVALID_ENCODE_PARAMS = 4002,

    // Configuration errors (5000-5999)
    UNSUPPORTED_CHAIN = 5001,
    MISSING_CONFIG = 5002,
    MISSING_SPACING = 5003,

    // API/RPC errors (6000-6999)
    API_REQUEST_FAILED = 6001,
    RPC_CALL_FAILED = 6002,
}

/**
 * Base error class for all Synfutures SDK errors
 */
export class SynfError extends Error {
    readonly code: ErrorCode;
    readonly details?: Record<string, unknown>;
    readonly cause?: Error;

    constructor(message: string, code: ErrorCode, details?: Record<string, unknown>, cause?: Error) {
        super(message);
        this.name = 'SynfError';
        this.code = code;
        this.details = details;
        if (cause) {
            this.cause = cause;
        }
    }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends SynfError {
    constructor(
        message: string,
        code: ErrorCode = ErrorCode.INVALID_PARAM,
        details?: Record<string, unknown>,
        cause?: Error
    ) {
        super(message, code, details, cause);
        this.name = 'ValidationError';
    }
}

/**
 * Error thrown when calculation fails
 */
export class CalculationError extends SynfError {
    constructor(
        message: string,
        code: ErrorCode = ErrorCode.CALCULATION_FAILED,
        details?: Record<string, unknown>,
        cause?: Error
    ) {
        super(message, code, details, cause);
        this.name = 'CalculationError';
    }
}

/**
 * Error thrown when parameter encoding fails
 */
export class ParamsEncodeError extends SynfError {
    constructor(message: string, code: ErrorCode = ErrorCode.ENCODING_FAILED, invalidParams?: unknown, cause?: Error) {
        super(message, code, { invalidParams }, cause);
        this.name = 'ParamsEncodeError';
    }
}

/**
 * Error thrown when simulation fails
 */
export class SimulationError extends SynfError {
    constructor(
        message: string,
        code: ErrorCode = ErrorCode.SIMULATION_FAILED,
        details?: Record<string, unknown>,
        cause?: Error
    ) {
        super(message, code, details, cause);
        this.name = 'SimulationError';
    }
}

/**
 * Error factory functions for common errors
 */
export const Errors = {
    /**
     * Create a validation error
     */
    validation: (message: string, code: ErrorCode = ErrorCode.INVALID_PARAM, details?: Record<string, unknown>) =>
        new ValidationError(message, code, details),

    /**
     * Create a simulation error
     */
    simulation: (message: string, code: ErrorCode = ErrorCode.SIMULATION_FAILED, details?: Record<string, unknown>) =>
        new SimulationError(message, code, details),

    /**
     * Create a calculation error
     */
    calculation: (message: string, code: ErrorCode = ErrorCode.CALCULATION_FAILED, details?: Record<string, unknown>) =>
        new CalculationError(message, code, details),

    /**
     * Create an encoding error
     */
    encoding: (message: string, invalidParams?: unknown) =>
        new ParamsEncodeError(message, ErrorCode.ENCODING_FAILED, invalidParams),

    /**
     * Specific validation errors
     */
    invalidDeadline: (deadline: number) =>
        Errors.validation(
            `Deadline must use whole seconds and fit a uint32 timestamp, got: ${deadline}`,
            ErrorCode.INVALID_DEADLINE,
            { deadline }
        ),

    invalidSlippage: (slippage: number, maxSlippage: number) =>
        Errors.validation(
            `Slippage must be between 0 and ${maxSlippage}, got: ${slippage}`,
            ErrorCode.INVALID_SLIPPAGE,
            { slippage, maxSlippage }
        ),

    invalidLeverage: (leverage: bigint) =>
        Errors.validation(`Leverage must be positive, got: ${leverage}`, ErrorCode.INVALID_LEVERAGE, {
            leverage: leverage.toString(),
        }),

    /**
     * Specific simulation errors
     */
    missingMarkPrice: (instrumentAddress?: string, expiry?: number) =>
        Errors.simulation(
            `Mark price missing${instrumentAddress ? ` for instrument ${instrumentAddress}` : ''}${expiry ? ` at expiry ${expiry}` : ''}`,
            ErrorCode.MISSING_MARK_PRICE,
            instrumentAddress && expiry ? { instrumentAddress, expiry } : undefined
        ),

    missingQuotation: () =>
        Errors.simulation('Quotation is required to build simulation context', ErrorCode.MISSING_QUOTATION),

    missingPosition: () =>
        Errors.simulation('Position is required to build simulation context', ErrorCode.MISSING_POSITION),

    missingAmm: (expiry?: number) =>
        Errors.simulation(
            `AMM snapshot missing${expiry ? ` for requested expiry ${expiry}` : ''}`,
            ErrorCode.MISSING_AMM,
            expiry ? { expiry } : undefined
        ),

    insufficientMargin: (required: bigint, available: bigint) =>
        Errors.simulation(
            `Insufficient margin: required ${required}, available ${available}`,
            ErrorCode.INSUFFICIENT_MARGIN,
            { required: required.toString(), available: available.toString() }
        ),

    /**
     * Specific calculation errors
     */
    invalidKey: (key: number | bigint) =>
        Errors.calculation(`Not a valid key: ${key}`, ErrorCode.INVALID_KEY, { key: key.toString() }),

    /**
     * Configuration errors
     */
    unsupportedChain: (chainId: number) =>
        new SynfError(`Unsupported chainId: ${chainId}`, ErrorCode.UNSUPPORTED_CHAIN, { chainId }),

    missingSpacing: () =>
        new SynfError('Spacing configuration missing: provide spacing or chainId', ErrorCode.MISSING_SPACING),

    /**
     * API/RPC errors
     */
    apiRequestFailed: (message: string = 'API request error') => new SynfError(message, ErrorCode.API_REQUEST_FAILED),
};
