import type { Host, Task, TaskResult, HostReport } from "./types.ts"

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
}

function pad(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length)
}

export function makeLogger(host: Host, verbose: boolean) {
  return (line: string) => {
    process.stdout.write(`${C.gray}[${host.alias}]${C.reset} ${line}\n`)
    if (verbose) {
      // verbose extra output via process.stdout directly in task
    }
  }
}

export function taskLine(host: Host, t: Task, r: TaskResult, verbose: boolean): void {
  let glyph: string
  let color: string

  if (r.skipped) {
    glyph = "→"
    color = C.gray
  } else if (r.failed) {
    glyph = "✗"
    color = C.red
  } else if (r.changed) {
    glyph = "~"
    color = C.yellow
  } else {
    glyph = "✓"
    color = C.green
  }

  const status = r.skipped ? "skipped" : r.failed ? "FAILED" : r.changed ? "changed" : "ok"
  const label = `${C.gray}[${host.alias}]${C.reset} ${color}${glyph}${C.reset} ${t.name} ${C.dim}(${status})${C.reset}`
  process.stdout.write(label + "\n")

  if (verbose && (r.stdout || r.stderr)) {
    if (r.stdout) process.stdout.write(`${C.gray}  stdout: ${r.stdout.trimEnd()}${C.reset}\n`)
    if (r.stderr) process.stdout.write(`${C.gray}  stderr: ${r.stderr.trimEnd()}${C.reset}\n`)
  }

  if (r.failed && r.error) {
    process.stdout.write(`${C.red}  error: ${r.error}${C.reset}\n`)
  }
}

export function playRecap(reports: HostReport[]): void {
  process.stdout.write(`\n${C.bold}PLAY RECAP${C.reset}\n`)
  const maxLen = Math.max(...reports.map(r => r.host.alias.length), 10)
  for (const rep of reports) {
    if (!rep.connected) {
      process.stdout.write(`  ${pad(rep.host.alias, maxLen)} : ${C.red}UNREACHABLE${C.reset} — ${rep.error ?? "connection failed"}\n`)
      continue
    }
    const ok = rep.results.filter(r => r.ok && !r.changed && !r.skipped).length
    const changed = rep.results.filter(r => r.changed).length
    const failed = rep.results.filter(r => r.failed).length
    const skipped = rep.results.filter(r => r.skipped).length
    const failColor = failed > 0 ? C.red : C.green
    process.stdout.write(
      `  ${C.bold}${pad(rep.host.alias, maxLen)}${C.reset} : ` +
      `${C.green}ok=${ok}${C.reset}  ` +
      `${C.yellow}changed=${changed}${C.reset}  ` +
      `${failColor}failed=${failed}${C.reset}  ` +
      `${C.gray}skipped=${skipped}${C.reset}\n`
    )
  }
}
