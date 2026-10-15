FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends bubblewrap socat ripgrep python3 python3-venv poppler-utils ca-certificates \
    && python3 -m venv /opt/work-python \
    && /opt/work-python/bin/pip install --no-cache-dir pypdf==5.9.0 python-docx==1.2.0 openpyxl==3.1.5 python-pptx==1.0.2 \
    && rm -rf /var/lib/apt/lists/*
ENV PATH="/opt/work-python/bin:${PATH}"
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && mkdir /data && chown node:node /data
COPY --chown=node:node src ./src
COPY --chown=node:node resources ./resources
USER node
ENV AGENT_BIND_HOST=0.0.0.0 AGENT_PORT=48082 AGENT_DATA_DIR=/data
EXPOSE 48082
CMD ["node", "src/main.js"]
