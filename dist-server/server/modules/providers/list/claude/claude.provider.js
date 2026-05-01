import { AbstractProvider } from '@/modules/providers/shared/base/abstract.provider.js';
import { ClaudeProviderAuth } from '@/modules/providers/list/claude/claude-auth.provider.js';
import { ClaudeMcpProvider } from '@/modules/providers/list/claude/claude-mcp.provider.js';
import { ClaudeSessionsProvider } from '@/modules/providers/list/claude/claude-sessions.provider.js';
export class ClaudeProvider extends AbstractProvider {
    mcp = new ClaudeMcpProvider();
    auth = new ClaudeProviderAuth();
    sessions = new ClaudeSessionsProvider();
    constructor() {
        super('claude');
    }
}
//# sourceMappingURL=claude.provider.js.map