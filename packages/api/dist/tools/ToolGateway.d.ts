import { ToolExecutionRecord } from './ToolRegistry';
export declare class ToolGateway {
    execute(toolId: string, input: any, _userPermissions: string[]): Promise<{
        result: any;
        record: ToolExecutionRecord;
    }>;
}
export declare const toolGateway: ToolGateway;
