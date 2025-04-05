# Stage 1: Builder
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy the rest of the application source code
COPY . .

# Run the build script (tsc, copy assets, tsc-alias)
RUN npm run build

# Prune devDependencies after build (Optional but good practice)
RUN npm prune --omit=dev

# Stage 2: Final Production Image
FROM node:20-slim

WORKDIR /app

# Copy package.json and pruned node_modules from the builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy the built application code (dist folder) from the builder stage
COPY --from=builder /app/dist ./dist

# --- Explicitly copy data files --- 
# Ensure CSV files are copied to the correct location in the final image
COPY src/data/*.csv ./dist/data/

# Make port 8080 available
EXPOSE 8080

# Define environment variables
ENV NODE_ENV=production
ENV PORT=8080

# --- Restore original ENTRYPOINT and CMD --- 
ENTRYPOINT ["node"]
CMD ["dist/server.js"]

# --- Debug Entrypoints/CMDs (commented out) ---
# ENTRYPOINT ["sleep", "infinity"]
# CMD ["echo", "--- Simple echo test: SUCCESS ---"]
# CMD ["node", "-e", "console.log('--- Node.js execution test: SUCCESS ---');"]
# CMD ["ls", "-la", "/app/dist"] 