FROM node:20-alpine

WORKDIR /app

# Install dependencies for Prisma and native modules
RUN apk add --no-cache openssl curl

# Copy package files
COPY package*.json ./

# Install dependencies including ts-node for runtime compilation
RUN npm install
RUN npm install -g ts-node typescript

# Copy Prisma schema
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Expose port
EXPOSE 4000

# Run database migrations and start the application with ts-node
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx ts-node --transpile-only src/index.ts"]
