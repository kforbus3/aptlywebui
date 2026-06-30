FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        aptly gnupg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY aptly.conf /etc/aptly.conf

RUN mkdir -p /data/aptly/public
WORKDIR /data/aptly
EXPOSE 8080

# Serve the aptly REST API. -no-lock lets the web UI and CLI share the DB.
CMD ["aptly", "api", "serve", "-listen=:8080", "-no-lock", "-config=/etc/aptly.conf"]
