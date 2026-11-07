ARG GO_BUILD_IMAGE=golang:1.25-bookworm
FROM ${GO_BUILD_IMAGE} AS build
ARG MCP_CRON_REV=0251d61a1fe1175ce96df46d4257499018f8f9e0
RUN git clone https://github.com/jolks/mcp-cron.git /src/mcp-cron && cd /src/mcp-cron && git checkout "$MCP_CRON_REV" \
    && CGO_ENABLED=0 go build -o /mcp-cron ./cmd/mcp-cron \
    && git archive --format=tar.gz -o /source.tar.gz HEAD
FROM scratch
COPY --from=build /mcp-cron /mcp-cron
COPY --from=build /src/mcp-cron/LICENSE /LICENSE
COPY --from=build /source.tar.gz /source.tar.gz
