package pipeline

# Worker Agent steps must pin an exact agent version (name@MAJOR.MINOR.PATCH), so a change to an
# agent's instructions in the catalog cannot silently change how a pipeline gates builds.

deny[msg] {
	walk(input.pipeline, [_, node])
	node.step.type == "Agent"
	name := object.get(node.step.spec, "agentName", "")
	not regex.match(`^[A-Za-z0-9_]+@[0-9]+\.[0-9]+\.[0-9]+$`, name)
	msg := sprintf("Agent step '%s' must reference an exact agent version as name@x.y.z (found '%s').", [node.step.identifier, name])
}
