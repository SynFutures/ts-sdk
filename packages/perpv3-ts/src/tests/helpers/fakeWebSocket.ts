import { isRecord } from './record';

type EventHandler = (...args: unknown[]) => void;

export class FakeWebSocket {
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

export function createFakeWebSocketFactory(sockets: FakeWebSocket[]): () => FakeWebSocket {
    return () => {
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket;
    };
}

export function parseWsRequest(payload: string): { method: string; params: Record<string, unknown> } {
    const parsed: unknown = JSON.parse(payload);
    if (!isRecord(parsed)) throw new Error('Invalid WS request payload');

    const method = parsed.method;
    const params = parsed.params;
    if (typeof method !== 'string' || !isRecord(params)) {
        throw new Error('Invalid WS request payload shape');
    }

    return { method, params };
}
