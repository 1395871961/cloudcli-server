import { providerRegistry } from '@/modules/providers/provider.registry.js';
/**
 * Application service for provider-backed session message operations.
 *
 * Callers pass a provider id and this service resolves the concrete provider
 * class, keeping normalization/history call sites decoupled from implementation
 * file layout.
 */
export const sessionsService = {
    /**
     * Lists provider ids that can load session history and normalize live messages.
     */
    listProviderIds() {
        return providerRegistry.listProviders().map((provider) => provider.id);
    },
    /**
     * Normalizes one provider-native event into frontend session message events.
     */
    normalizeMessage(providerName, raw, sessionId) {
        return providerRegistry.resolveProvider(providerName).sessions.normalizeMessage(raw, sessionId);
    },
    /**
     * Fetches normalized persisted session history for one provider/session pair.
     */
    fetchHistory(providerName, sessionId, options) {
        return providerRegistry.resolveProvider(providerName).sessions.fetchHistory(sessionId, options);
    },
};
//# sourceMappingURL=sessions.service.js.map