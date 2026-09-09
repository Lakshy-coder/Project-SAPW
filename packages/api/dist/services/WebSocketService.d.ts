import { WebSocketServer } from 'ws';
export declare class WebSocketService {
    private wss;
    private clients;
    private logger;
    constructor(wss: WebSocketServer);
    broadcast(event: string, payload: any): void;
}
