# Dockerfile for Prayer Times API Server (Node.js)
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy server file
COPY server-final.js .

# Install dependencies (none required - using native Node.js modules)
# The server only uses http and https which are built-in

# Expose port
EXPOSE 3001

# Set environment variable for port
ENV PORT=3001

# Start server
CMD ["node", "server-final.js"]
