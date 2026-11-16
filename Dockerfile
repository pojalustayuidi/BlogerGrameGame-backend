# Development convenience only. This stage must not be deployed publicly.
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 8085
CMD ["npm", "start"]
