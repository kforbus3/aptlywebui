FROM debian:bookworm-slim

# debian-archive-keyring ships the official Debian archive signing keys so
# mirrors of the Debian repositories verify out of the box (imported into
# aptly's keyring by entrypoint.sh). Ubuntu's keyring is not in Debian's repos;
# to mirror a signed Ubuntu (or other third-party) repo, import its key on the
# web UI's GPG Keys page first.
RUN apt-get update && apt-get install -y --no-install-recommends \
        aptly gnupg curl ca-certificates debian-archive-keyring \
    && rm -rf /var/lib/apt/lists/*

# Official Ubuntu Pro (ESM/FIPS) archive signing keys, extracted from Canonical's
# ubuntu-pro-client package. entrypoint.sh imports these into trustedkeys.gpg so
# authenticated Ubuntu Pro mirrors (esm.ubuntu.com) verify out of the box:
#   ubuntu-pro-esm-infra.gpg  56F7 650A 24C9 E9EC F87C  4D8D 4067 E403 13CB 4B13
#   ubuntu-pro-esm-apps.gpg   E8A4 43CE 3581 13D1 87BE  E0E6 AB01 A101 DB53 907B
#   ubuntu-pro-fips.gpg       E233 41B2 A146 7EDB F070  57D6 C199 7C40 EDE2 2758  (also signs fips-updates)
COPY keyrings/ /usr/share/keyrings/

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
