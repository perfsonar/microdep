FROM alpine:latest
MAINTAINER Otto J Wittner <wittner@sikt.no>

RUN apk update && apk add bash iproute2 docker
COPY netem/entrypoint.sh /
ENTRYPOINT ["/entrypoint.sh"]
