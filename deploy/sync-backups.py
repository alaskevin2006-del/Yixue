"""Copy verified server backup archives to a private directory on another machine."""
import argparse
import hashlib
import pathlib
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--destination', required=True)
parser.add_argument('--key', required=True)
parser.add_argument('--host', default='ubuntu@124.221.230.69')
args = parser.parse_args()
destination = pathlib.Path(args.destination).resolve()
destination.mkdir(parents=True, exist_ok=True)
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=yes', '-i', args.key, args.host]
listing = subprocess.check_output(ssh + ["sudo -n sh -c 'cd /opt/yixue/deploy-data/backups && cat *.tar.gz.sha256'"], timeout=60, text=True)
count = 0
for line in listing.splitlines():
    checksum, name = line.split(maxsplit=1)
    if not re.fullmatch(r'[0-9a-f]{64}', checksum) or not re.fullmatch(r'\d{8}T\d{6}Z\.tar\.gz', name):
        raise RuntimeError('Unexpected backup listing')
    target = destination / name
    if target.exists():
        with target.open('rb') as content:
            if hashlib.file_digest(content, 'sha256').hexdigest() == checksum:
                continue
    partial = target.with_suffix('.partial')
    with partial.open('wb') as output:
        subprocess.run(ssh + ['sudo -n cat /opt/yixue/deploy-data/backups/' + name], stdout=output, check=True, timeout=600)
    with partial.open('rb') as content:
        if hashlib.file_digest(content, 'sha256').hexdigest() != checksum:
            raise RuntimeError('Backup checksum mismatch')
    partial.replace(target)
    target.with_suffix('.gz.sha256').write_text(checksum + '  ' + name + '\n', encoding='utf-8')
    count += 1
print(f'Off-machine backup sync complete: {count} new verified archives')
