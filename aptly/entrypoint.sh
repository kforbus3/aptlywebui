#!/bin/bash
set -e

# aptly's gpg verifier checks upstream repository signatures against
# ~/.gnupg/trustedkeys.gpg (NOT the default pubring), so the Debian/Ubuntu
# archive keys must be exported into that specific keyring. Doing so lets
# mirrors of the official repositories — which every built-in preset points at —
# verify their signatures out of the box, with no per-mirror keyring config.
# Idempotent: re-importing existing keys is a no-op.
mkdir -p /root/.gnupg
chmod 700 /root/.gnupg
TRUSTED=/root/.gnupg/trustedkeys.gpg

for keyring in \
    /usr/share/keyrings/debian-archive-keyring.gpg \
    /usr/share/keyrings/ubuntu-archive-keyring.gpg \
    /usr/share/keyrings/ubuntu-pro-esm-infra.gpg \
    /usr/share/keyrings/ubuntu-pro-esm-apps.gpg \
    /usr/share/keyrings/ubuntu-pro-fips.gpg
do
    if [ -f "$keyring" ]; then
        gpg --no-default-keyring --keyring "$keyring" --export 2>/dev/null \
            | gpg --no-default-keyring --keyring "$TRUSTED" --import 2>/dev/null || true
    fi
done

# Hand off to the aptly API server (the image's CMD).
exec "$@"
