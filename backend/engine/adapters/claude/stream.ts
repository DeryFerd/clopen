/**
 * Claude Code Engine Adapter
 *
 * Wraps the @anthropic-ai/claude-agent-sdk into the AIEngine interface.
 * Messages are already in SDKMessage format — no conversion needed.
 */


import { query, type SDKMessage, type EngineSDKMessage, type Options, type Query, type SDKUserMessage } from '$shared/types/messaging';
import type { PermissionMode, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { normalizePath } from './path-utils';
import { setupEnvironmentOnce, getEngineEnv } from './environment';
import { handleStreamError } from './error-handler';
import { getEnabledMcpServers, getAllowedMcpTools } from '../../../mcp';
import type { AIEngine, EngineQueryOptions } from '../../types';
import type { EngineModel } from '$shared/types/engine';
import { CLAUDE_CODE_MODELS } from '$shared/constants/engines';

import { debug } from '$shared/utils/logger';

/** Pending AskUserQuestion resolver — stored while SDK is blocked waiting for user input */
interface PendingUserAnswer {
  resolve: (result: PermissionResult) => void;
  input: Record<string, unknown>;
}

/** Type guard for AsyncIterable */
function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return value != null && typeof value === 'object' && Symbol.asyncIterator in value;
}

export class ClaudeCodeEngine implements AIEngine {
  readonly name = 'claude-code' as const;
  private _isInitialized = false;
  private activeController: AbortController | null = null;
  private activeQuery: Query | null = null;
  private pendingUserAnswers = new Map<string, PendingUserAnswer>();

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isActive(): boolean {
    return this.activeController !== null;
  }

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    // One-time environment setup (idempotent, concurrency-safe)
    await setupEnvironmentOnce();

    this._isInitialized = true;
    debug.log('engine', '✅ Claude Code engine initialized');
  }

  async dispose(): Promise<void> {
    await this.cancel();
    this.pendingUserAnswers.clear();
    this._isInitialized = false;
  }

  async getAvailableModels(): Promise<EngineModel[]> {
    return CLAUDE_CODE_MODELS;
  }

  /**
   * Stream query with real-time callbacks
   */
  async *streamQuery(options: EngineQueryOptions): AsyncGenerator<EngineSDKMessage, void, unknown> {
    const {
      projectPath,
      prompt,
      resume,
      maxTurns = undefined,
      model = 'sonnet',
      includePartialMessages = false,
      abortController,
      claudeAccountId
    } = options;

    debug.log('chat', "Claude Code - Stream Query");
    debug.log('chat', { prompt });

    this.activeController = abortController || new AbortController();

    const normalizedProjectPath = normalizePath(projectPath);

    try {
      // Get custom MCP servers and allowed tools
      const mcpServers = getEnabledMcpServers();
      const allowedMcpTools = getAllowedMcpTools();

      debug.log('mcp', '📦 Loading custom MCP servers...');
      debug.log('mcp', `Enabled servers: ${Object.keys(mcpServers).length}`);
      debug.log('mcp', `Allowed tools: ${allowedMcpTools.length}`);

      // SDK uses cwd from options — no process.chdir() needed.
      // Environment is passed via env option — no process.env mutation.
      // When claudeAccountId is specified, the env uses that account's token
      // instead of the globally active account.
      const sdkOptions: Options = {
        permissionMode: 'bypassPermissions' as PermissionMode,
        allowDangerouslySkipPermissions: true,
        cwd: normalizedProjectPath,
        env: getEngineEnv(claudeAccountId),
        systemPrompt: { type: "preset", preset: "claude_code" },
        settingSources: ["user", "project", "local"],
        forkSession: true,
        // Custom permission handler: blocks on AskUserQuestion until user answers,
        // auto-allows everything else. Works alongside bypassPermissions.
        canUseTool: async (_toolName, input, options) => {
          if (_toolName === 'AskUserQuestion') {
            debug.log('engine', `AskUserQuestion detected (toolUseID: ${options.toolUseID}), waiting for user input...`);
            return new Promise<PermissionResult>((resolve) => {
              // Handle abort (stream cancelled while waiting)
              if (options.signal.aborted) {
                resolve({ behavior: 'deny', message: 'Cancelled' });
                return;
              }
              const onAbort = () => {
                this.pendingUserAnswers.delete(options.toolUseID);
                resolve({ behavior: 'deny', message: 'Cancelled' });
              };
              options.signal.addEventListener('abort', onAbort, { once: true });

              this.pendingUserAnswers.set(options.toolUseID, {
                resolve: (result: PermissionResult) => {
                  options.signal.removeEventListener('abort', onAbort);
                  resolve(result);
                },
                input
              });
            });
          }
          // Auto-allow all other tools
          return { behavior: 'allow' as const, updatedInput: input };
        },
        ...(model && { model }),
        ...(resume && { resume }),
        ...(maxTurns && { maxTurns }),
        ...(includePartialMessages && { includePartialMessages }),
        abortController: this.activeController,
        ...(Object.keys(mcpServers).length > 0 && { mcpServers }),
        ...(allowedMcpTools.length > 0 && { allowedTools: allowedMcpTools })
      };

      // Create async iterable from single message if needed
      let promptIterable: AsyncIterable<SDKUserMessage>;

      if (isAsyncIterable<SDKUserMessage>(prompt)) {
        promptIterable = prompt;
      } else {
        promptIterable = (async function* () {
          yield prompt as SDKUserMessage;
        })();
      }

      const queryInstance = query({
        prompt: promptIterable,
        options: sdkOptions,
      });

      this.activeQuery = queryInstance;

      for await (const message of queryInstance) {
        yield message;
      }

    } catch (error) {
      handleStreamError(error);
    } finally {
      this.activeController = null;
      this.activeQuery = null;
    }
  }

  /**
   * Cancel active query
   */
  async cancel(): Promise<void> {
    if (this.activeQuery && typeof this.activeQuery.interrupt === 'function') {
      try {
        await this.activeQuery.interrupt();
      } catch {
        // Ignore interrupt errors
      }
    }

    if (this.activeController) {
      this.activeController.abort();
      this.activeController = null;
    }
    this.activeQuery = null;
    // Reject all pending user answer promises (abort signal handles this, but clean up the map)
    this.pendingUserAnswers.clear();
  }

  /**
   * Interrupt the active query
   */
  async interrupt(): Promise<void> {
    if (this.activeQuery && typeof this.activeQuery.interrupt === 'function') {
      await this.activeQuery.interrupt();
    }
  }

  /**
   * Change permission mode for active query
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    if (this.activeQuery && typeof this.activeQuery.setPermissionMode === 'function') {
      await this.activeQuery.setPermissionMode(mode);
    }
  }

  /**
   * Resolve a pending AskUserQuestion by providing the user's answers.
   * This unblocks the canUseTool callback, allowing the SDK to continue.
   */
  resolveUserAnswer(toolUseId: string, answers: Record<string, string>): boolean {
    const pending = this.pendingUserAnswers.get(toolUseId);
    if (!pending) {
      debug.warn('engine', 'resolveUserAnswer: No pending question for toolUseId:', toolUseId);
      return false;
    }

    debug.log('engine', `Resolving AskUserQuestion (toolUseID: ${toolUseId})`);

    pending.resolve({
      behavior: 'allow',
      updatedInput: {
        ...pending.input,
        answers
      }
    });

    this.pendingUserAnswers.delete(toolUseId);
    return true;
  }
}
