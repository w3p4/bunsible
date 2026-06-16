import { play, task } from "../index.ts"

export default play({
  name: "bunsible smoke test",
  hosts: ["localhost"],
  tasks: [
    task.shell("echo hello from bunsible"),
    task.file({ path: "/tmp/bunsible-test", state: "directory", mode: "0755" }),
    task.copy({ src: "./examples/hello.txt", dest: "/tmp/bunsible-test/hello.txt" }),
    task.template({
      src: "./examples/templates/greeting.ts",
      dest: "/tmp/bunsible-test/greeting.txt",
      vars: { name: "world" },
    }),
    task.shell({ cmd: "cat /tmp/bunsible-test/greeting.txt", check: "test -f /tmp/bunsible-test/greeting.txt" }),
    task.file({ path: "/tmp/bunsible-test", state: "absent" }),
  ],
})
