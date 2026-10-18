# The binary is compiled by the pipeline (Run step) and only copied here, so the
# Go build cache saved by Cache Intelligence is used instead of a cold in-image build.
FROM gcr.io/distroless/static-debian12:nonroot

COPY bin/telemetry-ingest /app/telemetry-ingest

ENV PORT=8080
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/telemetry-ingest"]
