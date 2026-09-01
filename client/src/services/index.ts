/**
 * client/src/services/ — Client-side API and WebSocket service layer.
 *
 * PLANNED (Phase 2):
 *   - apiClient.ts: HTTP client for REST API calls (fetch-based)
 *   - wsClient.ts: WebSocket client connecting to the server
 *     - Receives SimulationEvents and dispatches to UI state
 *     - Sends commands to the server
 *
 * ARCHITECTURAL RULE:
 *   All server communication is encapsulated here.
 *   React components never call fetch() or WebSocket directly.
 *   Components use hooks that call these services.
 */
