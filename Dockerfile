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
RUN npm run build

# Remove development dependencies
RUN npm prune --omit=dev

# Final stage
FROM node:20-slim

# Set the working directory in the container
WORKDIR /app

# Copy built artifacts and necessary files from the builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY src/data/*.csv ./dist/data/

# Expose the port the app runs on
EXPOSE 8080

# Define the command to run the application
# ENTRYPOINT ["node"]
# CMD ["dist/server.js"]

# For debugging: Keep the container running indefinitely
ENTRYPOINT ["sleep", "infinity"]
# CMD [] 