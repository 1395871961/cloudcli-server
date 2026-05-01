import { AbstractProvider } from '../../shared/base/abstract.provider.js';
import { CodexProviderAuth } from './codex-auth.provider.js';
import { CodexMcpProvider } from './codex-mcp.provider.js';
import { CodexSessionsProvider } from './codex-sessions.provider.js';
export class CodexProvider extends AbstractProvider {
    mcp = new CodexMcpProvider();
    auth = new CodexProviderAuth();
    sessions = new CodexSessionsProvider();
    constructor() {
        super('codex');
    }
}
//# sourceMappingURL=codex.provider.js.map