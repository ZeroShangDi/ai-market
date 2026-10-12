FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
COPY src src
RUN --mount=type=cache,target=/root/.m2 mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /service
COPY --from=build /workspace/target/ai-service-0.1.0.jar app.jar
RUN mkdir -p /service/data && chown -R 10001:10001 /service
USER 10001:10001
ENV AI_BIND_HOST=0.0.0.0
EXPOSE 48081
ENTRYPOINT ["java","-Xms64m","-Xmx384m","-jar","app.jar"]
