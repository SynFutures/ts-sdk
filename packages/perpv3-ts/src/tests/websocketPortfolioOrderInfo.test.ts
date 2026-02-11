import type { Address } from 'viem';
import { PublicWebsocketClient, type PortfolioStreamData } from '../apis/websocket';

type EventHandler = (...args: unknown[]) => void;

class FakeWebSocket {
    readyState = 0;
    readonly sent: string[] = [];

    private readonly listeners = new Map<string, EventHandler[]>();

    addEventListener(event: string, handler: EventHandler): void {
        const existing = this.listeners.get(event) ?? [];
        existing.push(handler);
        this.listeners.set(event, existing);
    }

    send(data: string): void {
        this.sent.push(data);
    }

    close(): void {
        this.readyState = 3;
        this.emit('close', {});
    }

    open(): void {
        this.readyState = 1;
        this.emit('open');
    }

    message(data: string): void {
        this.emit('message', { data });
    }

    private emit(event: string, payload?: unknown): void {
        for (const handler of this.listeners.get(event) ?? []) {
            handler(payload);
        }
    }
}

describe('PublicWebsocketClient portfolio orderInfo passthrough', () => {
    it('passes through portfolio orderInfo.oid (string) as-is', () => {
        const sockets: FakeWebSocket[] = [];
        const handler = jest.fn<void, [PortfolioStreamData]>();

        const mixedCaseUserAddress = '0xB09C8ca5407EeAE12511596De181FdB92d2aB26c' as Address;

        const client = new PublicWebsocketClient({
            url: 'ws://localhost',
            pingIntervalMs: 0,
            autoReconnect: false,
            wsFactory: () => {
                const socket = new FakeWebSocket();
                sockets.push(socket);
                return socket;
            },
        });

        client.subscribePortfolio({ chainId: 143, userAddress: mixedCaseUserAddress, type: 'portfolio' }, (payload) =>
            handler(payload)
        );

        expect(sockets).toHaveLength(1);
        const socket = sockets[0];
        socket.open();

        socket.message(
            JSON.stringify({
                stream: 'portfolio',
                data: {
                    type: 'order',
                    userAddress: mixedCaseUserAddress,
                    instrument: '0x73Ada1Ea346cc3908f41CF67a040f0ACd7808BE0',
                    expiry: '4294967295',
                    orderInfo: {
                        oid: '1869451624454',
                        orderId: '1030054447319000011',
                        type: 'placed',
                    },
                },
            })
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0]).toMatchObject({
            type: 'order',
            userAddress: mixedCaseUserAddress,
            orderInfo: {
                oid: '1869451624454',
                orderId: '1030054447319000011',
                type: 'placed',
            },
        });

        client.close();
    });
});
