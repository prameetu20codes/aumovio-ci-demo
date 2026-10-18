package pipeline

# Every CI stage that runs tests or builds an image must have Cache Intelligence enabled.

build_step_types := {
	"Test",
	"RunTests",
	"BuildAndPushDockerRegistry",
	"BuildAndPushECR",
	"BuildAndPushGCR",
	"BuildAndPushGAR",
	"BuildAndPushACR",
}

deny[msg] {
	walk(input.pipeline, [_, node])
	stage := node.stage
	stage.type == "CI"
	stage_has_build_step(stage)
	not stage.spec.caching.enabled == true
	msg := sprintf("CI stage '%s' builds or tests code but Cache Intelligence is off. Set spec.caching.enabled: true.", [stage.name])
}

stage_has_build_step(stage) {
	walk(stage.spec.execution, [_, node])
	build_step_types[node.step.type]
}
