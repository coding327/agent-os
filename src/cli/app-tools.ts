import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const CLARIFICATION_TOOL_NAME = "request_clarification";
export const CLAUDE_CLARIFICATION_TOOL_NAME = `mcp__agent_os__${CLARIFICATION_TOOL_NAME}`;

function serverInvocation(): { command: string; args: string[] } {
  const runningFromTypeScript = import.meta.url.endsWith(".ts");
  const server = fileURLToPath(
    new URL(
      runningFromTypeScript
        ? "../mcp/clarification-server.ts"
        : "../mcp/clarification-server.js",
      import.meta.url,
    ),
  );
  if (!runningFromTypeScript) {
    return { command: process.execPath, args: [server] };
  }
  const tsxCli = fileURLToPath(
    new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url),
  );
  return { command: process.execPath, args: [tsxCli, server] };
}

function ensureClaudeMcpConfigFile(): string {
  const configDir = join(tmpdir(), "agent-os");
  mkdirSync(configDir, { recursive: true });
  const configPath = join(configDir, "claude-mcp-config.json");
  const invocation = serverInvocation();
  const config = {
    mcpServers: {
      agent_os: {
        type: "stdio",
        command: invocation.command,
        args: invocation.args,
      },
    },
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  return configPath;
}

function ensureCodexProfile(): string {
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  mkdirSync(codexHome, { recursive: true });
  const profilePath = join(codexHome, "agent-os.config.toml");
  const invocation = serverInvocation();
  const toml = `
[features]
non_prefixed_mcp_tool_names = true

[mcp_servers.agent_os]
command = ${JSON.stringify(invocation.command)}
args = [
  ${invocation.args.map((arg) => JSON.stringify(arg)).join(",\n  ")}
]
`;
  writeFileSync(profilePath, toml, "utf8");
  return "agent-os";
}

export function claudeAppToolArgs(): string[] {
  return ["--mcp-config", ensureClaudeMcpConfigFile()];
}

export function codexAppToolArgs(): string[] {
  const profile = ensureCodexProfile();
  return ["-p", profile];
}
