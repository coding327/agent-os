import {
  spawn,
  type ChildProcessByStdio,
  type SpawnOptions,
} from "node:child_process";
import type { Readable, Writable } from "node:stream";

// cmd.exe 的元字符：不转义会被 shell 解释，还会带来命令注入风险。
// 参考 cross-spawn（https://github.com/moxystudio/node-cross-spawn）。
const WINDOWS_META_CHARS = /([()\][%!^"`<>&|;, *?])/g;

/** 对单个参数做 Windows cmd.exe 安全转义（覆盖空格 / 中文 / 元字符）。 */
function escapeWindowsArg(arg: string): string {
  // 反斜杠后跟双引号：反斜杠翻倍，双引号转义
  arg = arg.replace(/(\\*)"/g, '$1$1\\"');
  // 结尾反斜杠翻倍（后面会补一个收尾双引号）
  arg = arg.replace(/(\\*)$/, '$1$1');
  // 整体加双引号，保护空格
  arg = `"${arg}"`;
  // 用 ^ 转义 cmd 元字符，防止变量展开 / 命令拼接 / 注入
  return arg.replace(WINDOWS_META_CHARS, "^$1");
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
  return spawn(command, args.map(escapeWindowsArg), {
    ...options,
    shell: true,
    windowsHide: true,
  });
}
