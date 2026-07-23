FROM debian:bookworm-slim

# debian-archive-keyring ships the official Debian archive signing keys so
# mirrors of the Debian repositories verify out of the box (imported into
# aptly's keyring by entrypoint.sh). Ubuntu's keyring is not in Debian's repos;
# to mirror a signed Ubuntu (or other third-party) repo, import its key on the
# web UI's GPG Keys page first.
RUN apt-get update && apt-get install -y --no-install-recommends \
        aptly gnupg curl ca-certificates debian-archive-keyring \
    && rm -rf /var/lib/apt/lists/*

COPY aptly.conf /etc/aptly.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

RUN mkdir -p /data/aptly/public
WORKDIR /data/aptly
EXPOSE 8080

# entrypoint.sh imports the archive keyrings, then execs this command.
# -no-lock lets the web UI and CLI share the DB.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["aptly", "api", "serve", "-listen=:8080", "-no-lock", "-config=/etc/aptly.conf"]
