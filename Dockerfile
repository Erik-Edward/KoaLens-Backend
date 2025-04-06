# Use an official Node.js runtime as a parent image
# Builder stage
FROM node:20-slim AS builder

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock) files
COPY package*.json ./

# Install dependencies using npm ci for reproducible builds
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the TypeScript project
RUN npm run build || true

# Explicitly copy config files after build
RUN mkdir -p dist/services dist/utils dist/config dist/routes
RUN if [ ! -f "dist/services/videoAnalysisService.js" ]; then cp src/services/videoAnalysisService.ts dist/services/; fi
RUN if [ ! -f "dist/services/veganValidator.js" ]; then cp src/services/veganValidator.ts dist/services/; fi
RUN if [ ! -f "dist/utils/videoOptimizer.js" ]; then cp src/utils/videoOptimizer.ts dist/utils/; fi
RUN if [ ! -f "dist/utils/errorHandling.js" ]; then cp src/utils/errorHandling.ts dist/utils/; fi
RUN if [ ! -f "dist/config/ai-config.js" ]; then cp src/config/ai-config.js dist/config/; fi
RUN if [ ! -f "dist/routes/testGemini.js" ]; then cp src/routes/testGemini.ts dist/routes/testGemini.js; fi

# Remove development dependencies
RUN npm prune --omit=dev

# Final stage
FROM node:20-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Copy built artifacts and necessary files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src/config/ai-config.js ./dist/config/

# Installera endast produktionsberoenden
RUN npm ci --omit=dev

# Expose the port the app runs on
EXPOSE 8080

# Define the command to run the application
ENTRYPOINT ["node"]
CMD ["dist/server.js"] 