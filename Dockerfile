FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# aucune dépendance npm : on copie simplement le code, les données et les images
COPY package.json server.js ./
COPY data ./data
COPY img ./img

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
