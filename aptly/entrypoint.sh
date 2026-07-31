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

# A hard reboot can corrupt aptly's LevelDB manifest, after which every API
# call fails with "leveldb: manifest corrupted" until `aptly db recover`
# rebuilds it. Probe the database with a cheap read before serving and recover
# automatically, so the API never comes up wedged against a corrupt database.
# On a healthy (or brand-new) database the probe succeeds and nothing runs.
if ! aptly -config=/etc/aptly.conf snapshot list -raw >/dev/null 2>&1; then
    echo "aptly database failed its startup check; running 'aptly db recover'..."
    aptly -config=/etc/aptly.conf db recover || true
    if aptly -config=/etc/aptly.conf snapshot list -raw >/dev/null 2>&1; then
        echo "aptly database recovered."
    else
        echo "WARNING: aptly database still failing after 'aptly db recover';" \
             "starting the API anyway. Restore the db directory from a backup" \
             "if the API keeps returning 500s." >&2
    fi
fi

# Hand off to the aptly API server (the image's CMD).
exec "$@"
