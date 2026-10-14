"""Publish tracked production sources; preserve environment, data and Caddy routing.
Credentials are read interactively, never stored. Requires paramiko and trusted SSH host key.
"""
import datetime, getpass, hashlib, json, pathlib, shlex, subprocess, time
import paramiko

ROOT = pathlib.Path(__file__).resolve().parents[1]
HOST = '124.221.230.69'
BASE = '/opt/yixue'
COMPOSE = 'docker compose -f compose.yaml -f compose.ip.yaml -f compose.preview.yaml'

def main():
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if subprocess.check_output(['git', 'status', '--porcelain', '--', 'production'], cwd=ROOT, text=True).strip():
        raise RuntimeError('Commit production changes before publishing.')
    names = subprocess.check_output(['git', 'ls-files', '-z', 'production'], cwd=ROOT).decode().split('\0')
    names = [n for n in names if n]
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    release = f'{BASE}/releases/{revision}'
    backup = f'{BASE}/backups/{stamp}'
    oldtag = f'yixue-app:before-{stamp.lower()}'
    newtag = f'yixue-app:{revision}'
    client = paramiko.SSHClient(); client.load_system_host_keys()
    client.connect(HOST, username='ubuntu', password=getpass.getpass('SSH password: '), timeout=20)
    def run(command, quiet=False):
        _, out, err = client.exec_command(command)
        # Drain both streams while running to avoid blocking a verbose Docker build.
        channel=out.channel; output=bytearray(); errors=bytearray()
        while not channel.exit_status_ready() or channel.recv_ready() or channel.recv_stderr_ready():
            if channel.recv_ready(): output.extend(channel.recv(65536))
            if channel.recv_stderr_ready(): errors.extend(channel.recv_stderr(65536))
            time.sleep(.05)
        status=channel.recv_exit_status()
        if status:
            raise RuntimeError(f'Command failed ({status}): {command}\n'+bytes(output+errors).decode(errors='replace')[-6000:])
        value=output.decode()
        if not quiet and value.strip(): print(value.strip(), flush=True)
        return value
    try:
        oldimage=run("docker inspect yixue-app-1 --format '{{.Image}}'",True).strip()
        mounts=json.loads(run("docker inspect yixue-app-1 --format '{{json .Mounts}}'",True))
        assert any(m['Source']==BASE+'/deploy-data/app' and m['Destination']=='/data' for m in mounts)
        before=json.loads(run(f'curl -fsS https://{HOST}/api/health',True));assert before['status']=='ok'
        run(f'mkdir -p {shlex.quote(release)} {shlex.quote(backup)}')
        run(f'chmod 700 {shlex.quote(backup)}')
        sftp=client.open_sftp()
        uploaded=[]
        for name in names:
            relative=name.removeprefix('production/')
            if any(part in ['.env','node_modules','dist','deploy-data'] for part in pathlib.PurePosixPath(relative).parts): raise RuntimeError('Unsafe source path')
            data=subprocess.check_output(['git','show',f'HEAD:{name}'],cwd=ROOT)
            target=release+'/'+relative
            run('mkdir -p '+shlex.quote(str(pathlib.PurePosixPath(target).parent)),True)
            with sftp.open(target,'wb') as f:f.write(data)
            remotehash=run('sha256sum '+shlex.quote(target),True).split()[0]
            assert remotehash==hashlib.sha256(data).hexdigest()
            uploaded.append(relative)
        print(f'Uploaded and verified {len(uploaded)} source files. Building image.',flush=True)
        run(f'docker build --build-arg YIXUE_REVISION={revision} -t {newtag} {shlex.quote(release)}',True)
        run(f'docker tag {oldimage} {oldtag}')
        # Code archive excludes environment files and all user data.
        existing=[p for p in uploaded if run('test -f '+shlex.quote(BASE+'/'+p)+' && echo yes || true',True).strip()=='yes']
        run('tar -czf '+shlex.quote(backup+'/source.tar.gz')+' -C '+shlex.quote(BASE)+' '+ ' '.join(shlex.quote(p) for p in existing))
        print('Image built. Briefly stopping app for a consistent data/files backup.',flush=True)
        run(f'cd {BASE} && {COMPOSE} stop app')
        try:
            run(f'docker run --rm --user root -v {BASE}/deploy-data/app:/data:ro -v {backup}:/backup {oldtag} node scripts/backup.mjs backup /data /backup/data --offline',True)
            run(f'docker tag {newtag} yixue-app:latest')
            run(f'cd {BASE} && {COMPOSE} up -d --no-deps --no-build app')
            healthy=False
            for _ in range(30):
                try:
                    health=json.loads(run(f'curl -fsS https://{HOST}/api/health',True))
                    version=json.loads(run(f'curl -fsS https://{HOST}/version.json',True))
                    if health==before and version['revision']==revision:healthy=True;break
                except Exception:pass
                time.sleep(2)
            if not healthy:raise RuntimeError('Published version/health verification failed')
        except Exception:
            print('Restoring previous app image; user data is not rolled back.',flush=True)
            run(f'docker tag {oldtag} yixue-app:latest')
            run(f'cd {BASE} && {COMPOSE} up -d --no-deps --no-build app')
            raise
        # Keep future builds reproducible; copy only approved tracked source paths.
        for relative in uploaded:
            target=BASE+'/'+relative
            run('mkdir -p '+shlex.quote(str(pathlib.PurePosixPath(target).parent))+' && cp '+shlex.quote(release+'/'+relative)+' '+shlex.quote(target),True)
        preview=json.loads(run(f'curl -fsS https://{HOST}/preview/version.json',True))
        receipt={'revision':revision,'health':health,'previewRevision':preview['revision'],'backup':backup,'rollbackImage':oldtag,'release':release,'publishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        with sftp.open(backup+'/deployment.json','w') as f:f.write(json.dumps(receipt))
        (ROOT/'tmp').mkdir(exist_ok=True);(ROOT/'tmp/production-deployment.json').write_text(json.dumps(receipt,indent=2))
        print(json.dumps(receipt),flush=True)
    finally:client.close()

if __name__=='__main__':main()
