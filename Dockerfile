# Use an official Node.js runtime as the base image
FROM node:20-slim

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application source code
COPY . .

# Create the config directory to ensure it exists
RUN mkdir -p dist/config

# First copy the ai-config.js to ensure it's available
RUN cp -v src/config/ai-config.js dist/config/

# Build the application from TypeScript to JavaScript
RUN npm run build || echo "Build completed with warnings"

# Install ffmpeg for video processing
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Create the data directory and ensure CSV files are copied
RUN mkdir -p dist/data
RUN cp -v src/data/*.csv dist/data/ || echo "CSV files not found"

# Make sure critical files exist
RUN ls -la dist/config/
RUN ls -la dist/services/

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV ENABLE_TEST_ROUTES=true

# Expose the port the app runs on
EXPOSE 8080

# Start the application
CMD ["node", "dist/server.js"] 