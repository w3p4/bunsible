import { test, expect } from "bun:test"
import { parseHost } from "./inventory.ts"

test("bare hostname", () => {
  const h = parseHost("web1")
  expect(h.host).toBe("web1")
  expect(h.alias).toBe("web1")
  expect(h.user).toBeUndefined()
  expect(h.port).toBeUndefined()
})

test("user@host", () => {
  const h = parseHost("deploy@web1.example.com")
  expect(h.host).toBe("web1.example.com")
  expect(h.user).toBe("deploy")
  expect(h.port).toBeUndefined()
})

test("user@host:port", () => {
  const h = parseHost("deploy@web1.example.com:2222")
  expect(h.host).toBe("web1.example.com")
  expect(h.user).toBe("deploy")
  expect(h.port).toBe(2222)
})

test("localhost", () => {
  const h = parseHost("localhost")
  expect(h.host).toBe("localhost")
  expect(h.alias).toBe("localhost")
})

test("Host object passthrough", () => {
  const h = parseHost({ alias: "mybox", host: "10.0.0.1", user: "root", port: 22 })
  expect(h.alias).toBe("mybox")
  expect(h.host).toBe("10.0.0.1")
  expect(h.user).toBe("root")
})

test("Host object without alias uses host", () => {
  const h = parseHost({ alias: "10.0.0.1", host: "10.0.0.1" })
  expect(h.alias).toBe("10.0.0.1")
})
