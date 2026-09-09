"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolRegistry = exports.ToolRegistry = void 0;
class ToolRegistry {
    tools = new Map();
    register(tool) {
        if (this.tools.has(tool.id)) {
            throw new Error(`Tool ${tool.id} already registered`);
        }
        this.tools.set(tool.id, tool);
    }
    getTool(id) {
        return this.tools.get(id);
    }
    listTools() {
        return Array.from(this.tools.values());
    }
}
exports.ToolRegistry = ToolRegistry;
exports.toolRegistry = new ToolRegistry();
