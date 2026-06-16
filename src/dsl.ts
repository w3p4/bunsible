import type { PlayDef, Task } from "./types.ts"
import { shell, type ShellOpts } from "./modules/shell.ts"
import { copy, type CopyOpts } from "./modules/copy.ts"
import { template, type TemplateOpts } from "./modules/template.ts"
import { file, type FileOpts } from "./modules/file.ts"
import { pkg, type PackageOpts } from "./modules/package.ts"
import { service, type ServiceOpts } from "./modules/service.ts"

export function play(def: PlayDef): PlayDef {
  if (!def.hosts?.length) throw new Error("play: hosts required")
  if (!def.tasks?.length) throw new Error("play: tasks required")
  return def
}

export const task = {
  shell(arg: string | ShellOpts): Task { return shell(arg) },
  copy(opts: CopyOpts): Task { return copy(opts) },
  template(opts: TemplateOpts): Task { return template(opts) },
  file(opts: FileOpts): Task { return file(opts) },
  package(arg: string | string[] | PackageOpts): Task { return pkg(arg) },
  service(opts: ServiceOpts): Task { return service(opts) },
}
