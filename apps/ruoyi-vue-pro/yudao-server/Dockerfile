FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY . .
RUN --mount=type=cache,target=/root/.m2 mvn -pl yudao-server -am -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /yudao-server
COPY --from=build /workspace/yudao-server/target/yudao-server.jar app.jar
ENV TZ=Asia/Shanghai
ENV JAVA_OPTS="-Xms256m -Xmx768m -Djava.security.egd=file:/dev/./urandom"
ENV ARGS=""
EXPOSE 48080
CMD java ${JAVA_OPTS} -jar app.jar $ARGS
