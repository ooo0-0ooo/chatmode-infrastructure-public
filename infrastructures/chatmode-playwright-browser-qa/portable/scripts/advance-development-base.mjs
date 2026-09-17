import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const policyPath = path.join(repositoryRoot, ".chatmode/development-branch-policy.json")
const policy = JSON.parse(readFileSync(policyPath, "utf8"))
const baseBranch = policy.rollingDevelopmentBase
const targetInput = process.argv[2]?.trim()

function fail(message) {
  console.error(`Rolling-base policy error: ${message}`)
  process.exit(1)
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  }).trim()
}

function gitStatus(args) {
  return spawnSync("git", args, { cwd: repositoryRoot, stdio: "ignore" }).status
}

if (!targetInput) {
  fail("usage: <package-manager> run branch:advance-base -- <formal-round-final-ref-or-sha>")
}
if (git(["status", "--porcelain"])) {
  fail("working tree is not clean; finish or preserve local work before advancing the rolling base")
}

console.log(`Fetching origin/${baseBranch} and target refs...`)
git(["fetch", "origin", "--prune", "--tags"], { stdio: "inherit" })
const baseRef = `origin/${baseBranch}`
const baseSha = git(["rev-parse", `${baseRef}^{commit}`])

let targetSha
try {
  targetSha = git(["rev-parse", `${targetInput}^{commit}`])
} catch {
  try {
    targetSha = git(["rev-parse", `origin/${targetInput}^{commit}`])
  } catch {
    fail(`cannot resolve target ref ${targetInput}`)
  }
}

if (baseSha === targetSha) {
  console.log(`Rolling base already points to ${targetSha}; nothing to do.`)
  process.exit(0)
}

if (gitStatus(["merge-base", "--is-ancestor", baseSha, targetSha]) !== 0) {
  fail(`refusing non-fast-forward update: rolling base ${baseSha} is not an ancestor of target ${targetSha}`)
}

for (const requiredPath of policy.requiredInheritedPaths ?? []) {
  if (gitStatus(["cat-file", "-e", `${targetSha}:${requiredPath}`]) !== 0) {
    fail(`target ${targetSha} is missing required inherited path ${requiredPath}`)
  }
}

console.log(`Fast-forwarding ${baseBranch}: ${baseSha} -> ${targetSha}`)
git(["push", "origin", `${targetSha}:refs/heads/${baseBranch}`], { stdio: "inherit" })

git(["fetch", "origin", baseBranch], { stdio: "inherit" })
const remoteSha = git(["rev-parse", `origin/${baseBranch}^{commit}`])
if (remoteSha !== targetSha) {
  fail(`post-push verification failed: origin/${baseBranch}=${remoteSha}, expected ${targetSha}`)
}

console.log("Rolling development base advanced safely by fast-forward.")
console.log(`base branch: ${baseBranch}`)
console.log(`new commit:  ${targetSha}`)
