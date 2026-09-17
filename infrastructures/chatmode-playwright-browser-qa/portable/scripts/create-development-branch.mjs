import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const policyPath = path.join(repositoryRoot, ".chatmode/development-branch-policy.json")
const policy = JSON.parse(readFileSync(policyPath, "utf8"))
const branchName = process.argv[2]?.trim()
const baseBranch = policy.rollingDevelopmentBase
const frozenPattern = new RegExp(policy.frozenAcceptanceBranchPattern)

function fail(message) {
  console.error(`Branch policy error: ${message}`)
  process.exit(1)
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  }).trim()
}

if (!branchName) fail("usage: <package-manager> run branch:new -- <new-development-branch-name>")
if (branchName === baseBranch) fail(`working branch must differ from rolling base ${baseBranch}`)
if (frozenPattern.test(branchName)) fail(`refusing frozen acceptance-style branch name ${branchName}`)
if (branchName === "main") fail("main is not the new-round product baseline")
if (git(["status", "--porcelain"])) fail("working tree is not clean")

const localExists = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], { cwd: repositoryRoot }).status === 0
const remoteExists = spawnSync("git", ["ls-remote", "--exit-code", "--heads", "origin", branchName], { cwd: repositoryRoot }).status === 0
if (localExists || remoteExists) {
  fail(`branch ${branchName} already exists; restore that round instead of replacing it`)
}

console.log(`Fetching rolling development base: origin/${baseBranch}`)
git(["fetch", "origin", baseBranch, "--prune"], { stdio: "inherit" })
const baseRef = `origin/${baseBranch}`
const baseSha = git(["rev-parse", `${baseRef}^{commit}`])

git(["switch", "--create", branchName, baseRef], { stdio: "inherit" })
const headSha = git(["rev-parse", "HEAD^{commit}"])
if (headSha !== baseSha) fail(`created branch HEAD ${headSha} does not equal rolling base ${baseSha}`)

console.log("Development branch created correctly.")
console.log(`branch: ${branchName}`)
console.log(`base:   ${baseBranch}`)
console.log(`commit: ${baseSha}`)
