import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const policyPath = path.join(repositoryRoot, ".chatmode/development-branch-policy.json")
const policy = JSON.parse(readFileSync(policyPath, "utf8"))
const baseBranch = policy.rollingDevelopmentBase
const frozenPattern = new RegExp(policy.frozenAcceptanceBranchPattern)

function fail(message) {
  console.error(`Branch policy FAIL: ${message}`)
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

const candidateBranch = (
  process.env.GITHUB_HEAD_REF ||
  process.env.GITHUB_REF_NAME ||
  git(["branch", "--show-current"]) ||
  "DETACHED"
).trim()

if (frozenPattern.test(candidateBranch)) {
  fail(`frozen acceptance branch ${candidateBranch} must not be used as an active development branch`)
}
if (candidateBranch === "main" && policy.rules?.neverUseMainAsNewRoundProductBaseline !== false) {
  fail("main must not be used as the new-round product-development branch")
}

// The rolling base is the one intentionally movable governance branch.
if (candidateBranch === baseBranch) {
  for (const requiredPath of policy.requiredInheritedPaths ?? []) {
    if (gitStatus(["cat-file", "-e", `HEAD:${requiredPath}`]) !== 0) {
      fail(`rolling base is missing required inherited path ${requiredPath}`)
    }
  }
  console.log(`Branch policy PASS: ${candidateBranch} is the canonical rolling development base.`)
  process.exit(0)
}

console.log(`Verifying candidate branch ${candidateBranch} against rolling base origin/${baseBranch}`)
git(["fetch", "origin", baseBranch, "--prune"], { stdio: "inherit" })
const baseRef = `origin/${baseBranch}`

let candidateRef = "HEAD"
if (process.env.GITHUB_HEAD_REF) {
  const remoteCandidateRef = `refs/remotes/origin/${process.env.GITHUB_HEAD_REF}`
  git(["fetch", "origin", `${process.env.GITHUB_HEAD_REF}:${remoteCandidateRef}`], { stdio: "inherit" })
  candidateRef = remoteCandidateRef
}

if (gitStatus(["merge-base", "--is-ancestor", baseRef, candidateRef]) !== 0) {
  const baseSha = git(["rev-parse", `${baseRef}^{commit}`])
  const candidateSha = git(["rev-parse", `${candidateRef}^{commit}`])
  fail(`candidate ${candidateSha} does not inherit rolling base ${baseSha}; create a new round from ${baseBranch}`)
}

for (const requiredPath of policy.requiredInheritedPaths ?? []) {
  if (gitStatus(["cat-file", "-e", `${candidateRef}:${requiredPath}`]) !== 0) {
    fail(`candidate does not inherit required policy/QA path ${requiredPath}`)
  }
}

const baseSha = git(["rev-parse", `${baseRef}^{commit}`])
const candidateSha = git(["rev-parse", `${candidateRef}^{commit}`])
console.log("Branch policy PASS")
console.log(`candidate branch: ${candidateBranch}`)
console.log(`candidate commit: ${candidateSha}`)
console.log(`rolling base:     ${baseBranch}`)
console.log(`base commit:      ${baseSha}`)
