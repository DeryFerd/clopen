import type { EngineType } from '$shared/types/engine';

/** Per-user settings (stored per user) */
export interface AppSettings {
	selectedEngine: EngineType;
	selectedModel: string;
	/** Remembers the last selected model per engine so switching engines preserves choices */
	engineModelMemory: Record<string, string>;
	autoSave: boolean;
	theme: 'light' | 'dark' | 'system';
	soundNotifications: boolean;
	pushNotifications: boolean;
	layoutPresetVisibility: Record<string, boolean>;
	/** Base font size in pixels (10–20). Default: 13. */
	fontSize: number;
}

/** Authentication mode */
export type AuthMode = 'none' | 'required';

/** System-wide settings (admin-only, shared across all users) */
export interface SystemSettings {
	/** Authentication mode: 'none' = single user no login, 'required' = multi-user with login. Default: 'required'. */
	authMode: AuthMode;
	/** Whether the initial setup wizard has been completed. Default: false. */
	onboardingComplete: boolean;
	/** Restrict folder browser to only these base paths. Empty = no restriction. */
	allowedBasePaths: string[];
	/** Automatically update to the latest version when available. Default: false. */
	autoUpdate: boolean;
	/** Session lifetime in days. Default: 30. */
	sessionLifetimeDays: number;
}
