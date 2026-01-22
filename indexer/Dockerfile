FROM node:20-alpine

WORKDIR /app

# Install dependencies for Prisma and native modules
RUN apk add --no-cache openssl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy Prisma schema
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 4000

# Run database migrations and start the application
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
