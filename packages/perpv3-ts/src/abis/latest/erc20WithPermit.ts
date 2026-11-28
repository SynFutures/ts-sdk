export const ERC20_WITH_PERMIT_ABI = [
    {
        name: 'DOMAIN_SEPARATOR',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'bytes32' }],
    },
    {
        name: 'name',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [
            {
                type: 'string',
            },
        ],
    },
    {
        name: 'nonces',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            {
                type: 'address',
                name: 'owner',
            },
        ],
        outputs: [
            {
                type: 'uint256',
            },
        ],
    },
    {
        name: 'permit',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            {
                type: 'address',
                name: 'owner',
            },
            {
                type: 'address',
                name: 'spender',
            },
            {
                type: 'uint256',
                name: 'value',
            },
            {
                type: 'uint256',
                name: 'deadline',
            },
            {
                type: 'uint8',
                name: 'v',
            },
            {
                type: 'bytes32',
                name: 'r',
            },
            {
                type: 'bytes32',
                name: 's',
            },
        ],
        outputs: [],
    },
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            {
                type: 'address',
                name: 'owner',
            },
            {
                type: 'address',
                name: 'spender',
            },
        ],
        outputs: [
            {
                type: 'uint256',
            },
        ],
    },
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            {
                type: 'address',
                name: 'spender',
            },
            {
                type: 'uint256',
                name: 'amount',
            },
        ],
        outputs: [
            {
                type: 'bool',
            },
        ],
    },
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            {
                type: 'address',
                name: 'account',
            },
        ],
        outputs: [
            {
                type: 'uint256',
            },
        ],
    },
] as const;
