FROM node:latest
WORKDIR /app
COPY . .
RUN apt-get update && apt-get install -y curl vim
RUN npm install

ENV PORT=3000 NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
