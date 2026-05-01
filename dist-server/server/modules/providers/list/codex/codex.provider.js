import { AbstractProvider } from '@/modules/providers/shared/base/abstract.provider.js';
import { CodexProviderAuth } from '@/modules/providers/list/codex/codex-auth.provider.js';
import { CodexMcpProvider } from '@/modules/providers/list/codex/codex-mcp.provider.js';
import { CodexSessionsProvider } from '@/modules/providers/list/codex/codex-sessions.provider.js';
export class CodexProvider extends AbstractProvider {
    mcp = new CodexMcpProvider();
    auth = new CodexProviderAuth();
    sessions = new CodexSessionsProvider();
    constructor() {
        super('codex');
    }
}
//# sourceMappingURL=codex.provider.js.map