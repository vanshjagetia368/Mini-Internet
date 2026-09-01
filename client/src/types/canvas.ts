/**
 * @file client/src/types/canvas.ts
 *
 * CLIENT-SIDE types for the visual canvas representation.
 *
 * ARCHITECTURAL RULE:
 *   These types are PRESENTATION types — they extend or adapt domain types
 *   for the visual layer. They do NOT replace domain types.
 *
 *   Domain types (Device, Link) define network behavior.
 *   Canvas types (CanvasNode, CanvasEdge) define visual representation.
 *
 * When React Flow renders a node, it uses CanvasNode.
 * The source of truth for that device's BEHAVIOR is the domain Device object.
 *
 * RELATIONSHIP:
 *   Domain Device ──mapped to──► CanvasNode
 *   Domain Link   ──mapped to──► CanvasEdge
 *
 * NOT:
 *   CanvasNode ──drives──► network behavior  ← FORBIDDEN
 */

import type { DeviceId, LinkId } from '@mini-internet/simulator';
import type { DeviceType } from '@mini-internet/simulator';

// ─── Canvas Node ──────────────────────────────────────────────────────────────

/**
 * Data attached to a React Flow node.
 * Contains only what the visual layer needs — domain ID reference,
 * label, and visual type indicator.
 *
 * The domain ID (`deviceId`) is what gets sent back to the server as a command.
 */
export interface CanvasNodeData {
  /** Domain-layer stable ID. Use this when sending commands to the server. */
  readonly deviceId: DeviceId;
  readonly label: string;
  readonly deviceType: DeviceType;
  readonly isDown: boolean;
}

// ─── Canvas Edge ──────────────────────────────────────────────────────────────

/**
 * Data attached to a React Flow edge.
 */
export interface CanvasEdgeData {
  /** Domain-layer stable ID. */
  readonly linkId: LinkId;
  readonly isDown: boolean;
  readonly delayMs: number;
}
