import hdnet from '@hdnet/commitlint-config'

/**
 * HDNET's shared config enforces `subject-case: sentence-case`, which collides
 * with Dependabot's lowercase default commit subjects like
 * `build(deps): bump foo from 1.0.0 to 1.0.1`. Skipping those messages lets
 * Dependabot PRs pass the commit-msg hook unchanged; the rules still apply to
 * every human-authored commit.
 */
export default {
  ...hdnet,
  ignores: [(message) => /^(build|chore)\(deps(-dev)?\): (bump|update)/i.test(message), ...(hdnet.ignores ?? [])],
}
