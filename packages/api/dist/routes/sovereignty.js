"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sovereigntyRouter = void 0;
const express_1 = require("express");
const NetworkMonitor_1 = require("../security/NetworkMonitor");
const router = (0, express_1.Router)();
exports.sovereigntyRouter = router;
// GET /api/sovereignty  – live sovereignty status panel
router.get('/', async (_req, res) => {
    const status = NetworkMonitor_1.networkMonitor.getStatus();
    return res.json(status);
});
// GET /api/sovereignty/connections  – active connections
router.get('/connections', (_req, res) => {
    return res.json({ connections: NetworkMonitor_1.networkMonitor.getConnections() });
});
// GET /api/sovereignty/violations  – policy violations log
router.get('/violations', (_req, res) => {
    return res.json({ violations: NetworkMonitor_1.networkMonitor.getViolations() });
});
