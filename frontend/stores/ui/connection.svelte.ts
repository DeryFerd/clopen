/**
 * WebSocket Connection Status Store
 * Tracks connection state reactively for UI components
 */

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

interface ConnectionState {
	status: ConnectionStatus;
	reconnectAttempts: number;
	/** Whether we just reconnected (for showing brief "Reconnected" message) */
	justReconnected: boolean;
}

export const connectionState = $state<ConnectionState>({
	status: 'connected',
	reconnectAttempts: 0,
	justReconnected: false,
});

let reconnectedTimeout: ReturnType<typeof setTimeout> | null = null;

export function setConnectionStatus(status: ConnectionStatus, reconnectAttempts = 0): void {
	const wasDisconnected = connectionState.status === 'disconnected' || connectionState.status === 'reconnecting';
	const isNowConnected = status === 'connected';

	connectionState.status = status;
	connectionState.reconnectAttempts = reconnectAttempts;

	// Show "Reconnected" briefly when recovering from a disconnection
	if (wasDisconnected && isNowConnected) {
		connectionState.justReconnected = true;

		if (reconnectedTimeout) clearTimeout(reconnectedTimeout);
		reconnectedTimeout = setTimeout(() => {
			connectionState.justReconnected = false;
			reconnectedTimeout = null;
		}, 2000);
	}
}
