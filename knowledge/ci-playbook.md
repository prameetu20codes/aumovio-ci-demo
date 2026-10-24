# Aumovio CI Playbook

Curated knowledge for the CI learning loop (`aumovio_ci_learning_loop`). The CI Remediation agent
reads this file from `main` on every run and proposes an updated version (`ci-playbook.md` in the
run output). Review the proposal and commit the parts you agree with; the agent never edits this
file itself.

## Known failure patterns

| Pattern key | Signature (stage / step / message) | Root cause | Fix | Owner | Times seen | Last seen | Verification |
|---|---|---|---|---|---|---|---|
| _none yet_ | | | | | | | |

## Flaky steps

| Stage.step | Symptom | Mitigation | Status |
|---|---|---|---|
| _none yet_ | | | |

## Infrastructure signals

| Signature | Meaning | Action |
|---|---|---|
| image pull or registry errors | Docker Hub rate limit or connector credentials | check `ffdockerconnector`; not a code issue |
| no runners / delegate unavailable | Harness Cloud capacity or delegate down | retry; not a code issue |

## Pipeline strategy decisions

| Decision | Reason | Date |
|---|---|---|
| SAST fails on high-severity Semgrep findings | high findings are real defects in this repo; false positives are suppressed inline with a reason | baseline |
| OSV fails on critical (CVSS >= 9) advisories only | non-critical dev-dependency advisories are tracked, not blocking | baseline |
| `outdated_test_policy=warn` | an intentional API change with a confident OUTDATED_TEST verdict should not block the build | baseline |

## Lessons

- _none yet_
