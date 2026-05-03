FROM node:20 AS build
WORKDIR /SciFlow
COPY . .
RUN npm install
RUN npm run build

FROM nginx:alpine
COPY --from=build /SciFlow/dist/ /usr/share/nginx/html
EXPOSE 5000
