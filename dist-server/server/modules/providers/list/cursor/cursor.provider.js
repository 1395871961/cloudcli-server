import { AbstractProvider } from '../../shared/base/abstract.provider.js';
import { CursorProviderAuth } from './cursor-auth.provider.js';
import { CursorMcpProvider } from './cursor-mcp.provider.js';
import { CursorSessionsProvider } from './cursor-sessions.provider.js';
export class CursorProvider extends AbstractProvider {
    mcp = new CursorMcpProvider();
    auth = new CursorProviderAuth();
    sessions = new CursorSessionsProvider();
    constructor() {
        super('cursor');
    }
}
//# sourceMappingURL=cursor.provider.js.map