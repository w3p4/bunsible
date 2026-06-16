#!/usr/bin/env bun
import { resolve } from "node:path"
import { runPlay } from "./executor.ts"
import type { PlayDef } from "./types.ts"

const args = Bun.argv.slice(2)

function usage(): never {
  process.stderr.write(`usage: bunsible <command> [options]

commands:
  run <playbook.ts>   Execute a playbook

options:
  --limit host1,host2   Only run on matching hosts (alias or hostname)
  --check               Dry-run: detect changes without applying
  --verbose             Print stdout/stderr from tasks
  --help                Show this help
`)
  process.exit(1)
}

const cmd = args[0]
if (!cmd || cmd === "--help" || cmd === "-h") usage()
if (cmd !== "run") {
  process.stderr.write(`unknown command: ${cmd}\n`)
  usage()
}

const playbookArg = args[1]
if (!playbookArg) {
  process.stderr.write("run requires a playbook path\n")
  usage()
}

const flags = args.slice(2)
const limit = flags.find(f => f.startsWith("--limit="))?.split("=")[1]?.split(",")
     ?? (flags.includes("--limit") ? flags[flags.indexOf("--limit") + 1]?.split(",") : undefined)
const checkMode = flags.includes("--check")
const verbose = flags.includes("--verbose")

const absPath = resolve(playbookArg)
if (!(await Bun.file(absPath).exists())) {
  process.stderr.write(`playbook not found: ${absPath}\n`)
  process.exit(1)
}

let def: PlayDef
try {
  const mod = await import(absPath) as { default?: PlayDef }
  def = mod.default ?? (mod as unknown as PlayDef)
  if (!def || !Array.isArray(def.hosts) || !Array.isArray(def.tasks)) {
    throw new Error("playbook must export default play({hosts, tasks})")
  }
} catch (e) {
  process.stderr.write(`failed to load playbook: ${String(e)}\n`)
  process.exit(1)
}

const report = await runPlay(def, { limit, checkMode, verbose })
process.exit(report.ok ? 0 : 2)
