package pipeline

# Every pipeline with a CI stage must run secret detection and SAST.

required_code_scanners := {"Gitleaks", "Semgrep"}

deny[msg] {
	has_ci_stage
	scanner := required_code_scanners[_]
	not pipeline_has_step_type(scanner)
	msg := sprintf("CI pipelines must include a '%s' scan step.", [scanner])
}

has_ci_stage {
	walk(input.pipeline, [_, node])
	node.stage.type == "CI"
}

pipeline_has_step_type(step_type) {
	walk(input.pipeline, [_, node])
	node.step.type == step_type
}
