import { AbstractProvider } from '@/modules/providers/shared/base/abstract.provider.js';
import { CursorProviderAuth } from '@/modules/providers/list/cursor/cursor-auth.provider.js';
import { CursorMcpProvider } from '@/modules/providers/list/cursor/cursor-mcp.provider.js';
import { CursorSessionsProvider } from '@/modules/providers/list/cursor/cursor-sessions.provider.js';
export class CursorProvider extends AbstractProvider {
    mcp = new CursorMcpProvider();
    auth = new CursorProviderAuth();
    sessions = new CursorSessionsProvider();
    constructor() {
        super('cursor');
    }
}
//# sourceMappingURL=cursor.provider.js.map