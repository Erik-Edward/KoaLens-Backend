# Use an official Node.js runtime as a parent image
# Using Node 20 based on your package.json engines requirement
FROM node:20-slim

# Set the working directory in the container
WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Bundle app source
COPY . .

# Build the TypeScript source to JavaScript
RUN npm run build

# Make port 8080 available to the world outside this container
EXPOSE 8080

# Define environment variable (redundant with fly.toml but good practice)
ENV NODE_ENV=production
ENV PORT=8080

# Run the app when the container launches
CMD ["node", "dist/server.js"] 