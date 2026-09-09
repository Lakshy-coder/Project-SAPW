"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
const ws_1 = require("ws");
const pino_1 = __importDefault(require("pino"));
class WebSocketService {
    wss;
    clients = new Set();
    logger = (0, pino_1.default)();
    constructor(wss) {
        this.wss = wss;
        this.wss.on('connection', (ws) => {
            this.clients.add(ws);
            ws.on('close', () => this.clients.delete(ws));
        });
    }
    broadcast(event, payload) {
        const message = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
        for (const client of this.clients) {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(message);
            }
        }
        this.logger.info({ event, payload }, 'Broadcasting WS event');
    }
}
exports.WebSocketService = WebSocketService;
