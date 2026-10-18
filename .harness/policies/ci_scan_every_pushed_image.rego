package pipeline

# Any stage that pushes a container image must also scan it in the same stage.

push_step_types := {
	"BuildAndPushDockerRegistry",
	"BuildAndPushECR",
	"BuildAndPushGCR",
	"BuildAndPushGAR",
	"BuildAndPushACR",
}

image_scan_step_types := {"AquaTrivy", "Grype"}

approved_scan_templates := {"trivy_scan_har_image", "org.trivy_scan_har_image", "account.trivy_scan_har_image"}

deny[msg] {
	walk(input.pipeline, [_, node])
	stage := node.stage
	stage_has_step_type(stage, push_step_types)
	not stage_has_image_scan(stage)
	msg := sprintf("Stage '%s' pushes a container image but has no container scan step (AquaTrivy or Grype).", [stage.name])
}

stage_has_step_type(stage, types) {
	walk(stage.spec.execution, [_, node])
	types[node.step.type]
}

stage_has_image_scan(stage) {
	stage_has_step_type(stage, image_scan_step_types)
}

stage_has_image_scan(stage) {
	walk(stage.spec.execution, [_, node])
	approved_scan_templates[node.step.template.templateRef]
}
