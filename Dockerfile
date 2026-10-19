FROM node:20.11.1-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

EXPOSE 8080
CMD ["npm", "start"]
