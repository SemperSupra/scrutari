FROM node:20-alpine
WORKDIR /app
COPY server.js .
RUN mkdir -p data
EXPOSE 3456
ENV PORT=3456 DATA_DIR=/app/data
CMD ["node", "server.js"]
