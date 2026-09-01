#!/bin/bash
#
# microdep-opensearch-guard.sh
#
# Self-heal the Microdep OpenSearch read grant.
#
# The Microdep map (via the CGIs) and the Grafana dashboards read the archive
# ANONYMOUSLY through https://localhost/opensearch. Read access to the Microdep
# indices (microdep*) is granted by inserting roles_yml_patch into
# the perfSONAR OpenSearch role config; opensearch_config_microdep.sh does that
# at package install time.
#
# A perfSONAR/OpenSearch UPGRADE re-initialises /etc/opensearch/opensearch-
# security/roles.yml (and reloads it via securityadmin) WITHOUT the Microdep
# patch, so the grant silently disappears until Microdep is re-installed. The
# symptom: the map and every Grafana Microdep panel report "No Data" because the
# archive answers HTTP 403 ("no permissions ... opendistro_security_anonymous").
#
# This guard probes anonymous read on a Microdep index and, ONLY if it is denied
# (403), re-applies the config via opensearch_config_microdep.sh. It is a no-op
# when the grant is present, and skips quietly when the archive is unreachable
# (e.g. OpenSearch restarting). Run it from a systemd timer.
#
# Exit status is always 0 (best-effort healer); actions are logged to syslog
# under the tag "microdep-opensearch-guard".

set -u

PROBE_URL="${MICRODEP_PROBE_URL:-https://localhost/opensearch/microdep*/_count}"
CONFIG_SCRIPT="${MICRODEP_CONFIG_SCRIPT:-/usr/lib/perfsonar/bin/microdep_commands/opensearch_config_microdep.sh}"
TAG="microdep-opensearch-guard"

log() { logger -t "$TAG" -- "$*" 2>/dev/null || echo "$TAG: $*" >&2; }

probe() { curl -s -k -o /dev/null -w '%{http_code}' --max-time 15 "$PROBE_URL" 2>/dev/null; }

code=$(probe)

case "$code" in
    200)
        # Grant present — nothing to do.
        exit 0
        ;;
    403)
        log "anonymous read on Microdep index denied (HTTP 403) — re-applying grant"
        if [ ! -x "$CONFIG_SCRIPT" ]; then
            log "ERROR: $CONFIG_SCRIPT missing or not executable — cannot heal"
            exit 0
        fi
        if "$CONFIG_SCRIPT" -y -q >/dev/null 2>&1; then
            newcode=$(probe)
            if [ "$newcode" = "200" ]; then
                log "grant restored (read now returns HTTP 200)"
            else
                log "re-apply ran but read still returns HTTP ${newcode:-?}"
            fi
        else
            log "ERROR: $CONFIG_SCRIPT exited non-zero"
        fi
        ;;
    000|"")
        # Archive not reachable (OpenSearch/apache down or restarting). Don't
        # thrash — the next timer tick will retry.
        log "archive not reachable (curl code ${code:-none}) — skipping this cycle"
        ;;
    *)
        # Some other status (e.g. 5xx). Not a permission problem we should fix by
        # re-applying roles; leave it and log for visibility.
        log "unexpected HTTP $code from archive probe — skipping (not a 403)"
        ;;
esac

exit 0
