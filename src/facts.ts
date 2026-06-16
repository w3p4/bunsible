import type { SshSession } from "./ssh.ts"
import type { HostFacts } from "./types.ts"

const CMD = `uname -s; echo '---'; cat /etc/os-release 2>/dev/null || true; echo '---'; command -v systemctl 2>/dev/null || true`

export async function detectFacts(ssh: SshSession): Promise<HostFacts> {
  const { stdout } = await ssh.run(CMD)
  const parts = stdout.split(/^---$/m).map(s => s.trim())

  const kernel = (parts[0] ?? "").trim().toLowerCase() === "linux" ? "linux" : "darwin"
  const osRelease = parts[1] ?? ""
  const hasSystemctl = (parts[2] ?? "").trim().length > 0

  let distro: string | undefined
  const idMatch = osRelease.match(/^ID=["']?([^"'\n]+)["']?/m)
  const idLikeMatch = osRelease.match(/^ID_LIKE=["']?([^"'\n]+)["']?/m)
  if (idMatch) distro = idMatch[1]?.toLowerCase()

  const idLike = idLikeMatch ? idLikeMatch[1]?.toLowerCase() ?? "" : ""

  let pkgMgr: HostFacts["pkgMgr"] = "unknown"
  let initSystem: HostFacts["initSystem"] = "unknown"

  if (kernel === "darwin") {
    pkgMgr = "brew"
    initSystem = "launchd"
  } else {
    if (distro === "alpine") {
      pkgMgr = "apk"
      initSystem = "openrc"
    } else if (distro && ["debian", "ubuntu", "raspbian", "mint"].some(d => distro!.includes(d) || idLike.includes(d))) {
      pkgMgr = "apt"
      initSystem = hasSystemctl ? "systemd" : "unknown"
    } else if (distro && ["rhel", "centos", "fedora", "rocky", "almalinux"].some(d => distro!.includes(d) || idLike.includes(d))) {
      pkgMgr = "dnf"
      initSystem = hasSystemctl ? "systemd" : "unknown"
    } else {
      initSystem = hasSystemctl ? "systemd" : "unknown"
    }
  }

  return { kernel: kernel === "linux" ? "linux" : "darwin", distro, pkgMgr, initSystem }
}
