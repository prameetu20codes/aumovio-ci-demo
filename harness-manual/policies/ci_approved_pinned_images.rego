package pipeline

# Step images must come from the approved list and be pinned to a tag other than latest.
# Images set through an expression (starting with <+) are checked after the expression resolves, at run time.

approved_image_prefixes := [
	"golang:",
	"golangci/golangci-lint:",
	"maven:",
	"eclipse-temurin:",
	"node:",
	"curlimages/curl:",
	"hadolint/hadolint:",
]

deny[msg] {
	image := step_images[_]
	not approved(image)
	msg := sprintf("Image '%s' is not on the approved list %v.", [image, approved_image_prefixes])
}

deny[msg] {
	image := step_images[_]
	not pinned(image)
	msg := sprintf("Image '%s' must be pinned to an explicit tag (not latest).", [image])
}

step_images[image] {
	walk(input.pipeline, [_, node])
	image := node.step.spec.image
	is_string(image)
	not startswith(image, "<+")
}

approved(image) {
	startswith(image, approved_image_prefixes[_])
}

pinned(image) {
	regex.match(`:[^/:]+$`, image)
	not endswith(image, ":latest")
}
