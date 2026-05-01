import { AbstractProvider } from '../../shared/base/abstract.provider.js';
import { GeminiProviderAuth } from './gemini-auth.provider.js';
import { GeminiMcpProvider } from './gemini-mcp.provider.js';
import { GeminiSessionsProvider } from './gemini-sessions.provider.js';
export class GeminiProvider extends AbstractProvider {
    mcp = new GeminiMcpProvider();
    auth = new GeminiProviderAuth();
    sessions = new GeminiSessionsProvider();
    constructor() {
        super('gemini');
    }
}
//# sourceMappingURL=gemini.provider.js.map