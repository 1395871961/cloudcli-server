import { AbstractProvider } from '../../shared/base/abstract.provider.js';
import { ClaudeProviderAuth } from './claude-auth.provider.js';
import { ClaudeMcpProvider } from './claude-mcp.provider.js';
import { ClaudeSessionsProvider } from './claude-sessions.provider.js';
export class ClaudeProvider extends AbstractProvider {
    mcp = new ClaudeMcpProvider();
    auth = new ClaudeProviderAuth();
    sessions = new ClaudeSessionsProvider();
    constructor() {
        super('claude');
    }
}
//# sourceMappingURL=claude.provider.js.map