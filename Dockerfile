# Simple Dockerfile for your AdminPanel Node/Express app
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the source code
COPY . .

# Environment
ENV PORT=3000
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
