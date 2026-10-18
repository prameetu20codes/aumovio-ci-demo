# The shaded JAR is built by the pipeline (Maven with Build Intelligence) and only copied here.
FROM gcr.io/distroless/java17-debian12:nonroot

COPY fleet-api/target/fleet-api.jar /app/fleet-api.jar

ENV PORT=8081
EXPOSE 8081
USER nonroot:nonroot
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/fleet-api.jar"]
