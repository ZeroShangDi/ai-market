FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && mkdir /data && chown node:node /data
COPY --chown=node:node src ./src
COPY --chown=node:node resources ./resources
USER node
ENV AGENT_BIND_HOST=0.0.0.0 AGENT_PORT=48082 AGENT_DATA_DIR=/data
EXPOSE 48082
CMD ["node", "src/main.js"]
