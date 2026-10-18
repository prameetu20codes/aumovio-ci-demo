package pipeline

# A failing step or stage must never be silently ignored.

deny[msg] {
	walk(input.pipeline, [path, node])
	node.action.type == "Ignore"
	msg := sprintf("Failure strategy 'Ignore' is not allowed (at %v). Use MarkAsFailure, Retry or ManualIntervention.", [path])
}
