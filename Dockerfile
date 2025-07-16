# Production stage
FROM node:22-alpine

# Set image labels
LABEL org.opencontainers.image.source="https://github.com/yourusername/tacia-docs"
LABEL org.opencontainers.image.title="Tacia Backend (JavaScript)"
LABEL org.opencontainers.image.description="JavaScript backend service for Tacia documentation system"

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN if [ -f package-lock.json ]; then \
      npm ci --only=production; \
    else \
      npm install --only=production; \
    fi

# Copy source code
COPY . .

# Expose the correct port
EXPOSE 7070

# Command to run the application with correct content-dir
CMD ["node", "server.js", "--port=7070", "--content-dir=/content"]
