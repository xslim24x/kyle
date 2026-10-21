#!/bin/sh
set -eu
umask 077
mkdir -p /backups
backup_file="/backups/kyle-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --file="$backup_file.partial"
mv "$backup_file.partial" "$backup_file"
find /backups -type f -name 'kyle-*.dump' -mtime +14 -delete
