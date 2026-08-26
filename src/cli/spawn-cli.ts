import {
  spawn,
  spawnSync,
  type ChildProcess,
  type ChildProcessByStdio,
  type SpawnOptions,
} from "node:child_process";
import type { Readable, Writable } from "node:stream";

// Windows 下 npm 安装的 codex/claude 是 .cmd 启动器，必须经 cmd.exe 执行。
// 这里按 Node 原 shell: true 的内部结构显式拉起 cmd.exe：
//   cmd.exe /d /s /c "<command>" <args...>
// /s 会剥掉程序名两侧的引号，参数逐个跟在后面，不再使用已弃用的 shell 选项。
// windowsVerbatimArguments 让 Node 原样传递参数（不额外转义），cmd 才能正确解析。
// Windows 上 prompt 走 stdin，参数都是固定开关和会话 UUID，不含空格；
// 若将来出现含空格的参数，需要另行处理 cmd 转义。
// 父进程退出或超时杀进程树时，codex/claude 仍可能作为孤儿进程存活，因此做两层清理：
// 1) taskkill /T 杀掉整棵进程树（快路径）；
// 2) 按 ParentProcessId 递归找到所有子孙进程逐个结束，包括已经从 cmd 脱离的进程。
function killProcessTree(rootPid: number): void {
  try {
    spawn("taskkill", ["/pid", String(rootPid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } catch (error) {
    console.error(`[spawn-cli] taskkill 失败: ${(error as Error).message}`);
  }
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "function Get-Desc([int]$id) {",
    "  $children = Get-CimInstance Win32_Process -Filter \"ParentProcessId=$id\" | Select-Object -ExpandProperty ProcessId",
    "  foreach ($c in $children) { Get-Desc $c }",
    "  Write-Output $id",
    "}",
    "Get-Desc ROOT_PID | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }",
  ]
    .join("\n")
    .replace("ROOT_PID", String(rootPid));
  try {
    spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        windowsHide: true,
        stdio: "ignore",
      },
    );
  } catch (error) {
    console.error(
      `[spawn-cli] 无法启动 PowerShell 清理进程树: ${(error as Error).message}`,
    );
  }
}

export function killCli(
  child: ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
): void {
  if (!child.pid) return void child.kill(signal);
  if (process.platform !== "win32") return void child.kill(signal);
  killProcessTree(child.pid);
  try {
    child.kill(signal);
  } catch (error) {
    console.error(`[spawn-cli] 直接终止子进程失败: ${(error as Error).message}`);
  }
}

// 登记仍存活的子进程：agent-os 进程退出或重启（如 tsx watch 热重载）时，
// 把已启动的 CLI 一起结束，避免变成无人管理的孤儿进程。
const activeChildren = new Set<ChildProcess>();
let exitHookInstalled = false;

function installExitHook(): void {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once("exit", () => {
    if (process.platform !== "win32") return;
    for (const child of activeChildren) {
      if (!child.pid) continue;
      try {
        spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } catch (error) {
        console.error(
          `[spawn-cli] 进程退出时清理失败: ${(error as Error).message}`,
        );
      }
    }
  });
}

function trackChild(child: ChildProcess): void {
  if (process.platform !== "win32") return;
  activeChildren.add(child);
  installExitHook();
  child.once("close", () => activeChildren.delete(child));
  child.once("error", () => activeChildren.delete(child));
}

export function spawnCli(
  command: string,
  args: string[],
  options: SpawnOptions & { stdio: ["ignore", "pipe", "pipe"] },
): ChildProcessByStdio<null, Readable, Readable>;
export function spawnCli(
  command: string,
  args: string[],
  options: SpawnOptions & { stdio: ["pipe", "pipe", "pipe"] },
): ChildProcessByStdio<Writable, Readable, Readable>;
export function spawnCli(
  command: string,
  args: string[],
  options: SpawnOptions & { stdio: SpawnOptions["stdio"] },
): ChildProcessByStdio<any, any, any> {
  if (process.platform !== "win32") {
    return spawn(command, args, options);
  }
  const comspec = process.env.ComSpec ?? process.env.comspec ?? "cmd.exe";
  const child = spawn(
    comspec,
    ["/d", "/s", "/c", `"${command}"`, ...args],
    {
      ...options,
      windowsHide: true,
      windowsVerbatimArguments: true,
    },
  );
  trackChild(child);
  return child;
}
