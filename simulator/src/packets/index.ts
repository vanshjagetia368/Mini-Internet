/**
 * simulator/src/packets/ — Packet domain types and processing.
 *
 * PLANNED (Phase 3):
 *   - Packet domain type (id, source, destination, ttl, payload size, type)
 *   - Packet lifecycle state machine
 *   - Packet forwarding engine (uses RoutingAlgorithm, does NOT implement routing)
 *
 * CURRENT STATE: Empty — packet simulation not yet implemented.
 * See ARCHITECTURE.md Phase 3.
 *
 * IMPORTANT: When implemented, this module must ask the RoutingAlgorithm
 * for route information. Packets must NOT contain routing logic themselves.
 */
