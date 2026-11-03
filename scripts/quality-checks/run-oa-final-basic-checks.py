"""Run only OC10/OC12 basic checks against the packaged OA application.

No database/server access and no shared target mutations. Temporary dependencies,
arguments and logs stay in this check's fixed ignored directory for root cleanup.
"""
from pathlib import Path
import argparse
import os
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / '.cloudflow-runtime/quality-oa-final-20261103'
MODULE = ROOT / 'cloudflow-backend/cloudflow-service-oa'
SOURCE = Path(__file__).with_name('OaFinalBasicChecks.java')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', choices=('all', 'applicant', 'meeting'), default='all')
    options = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    libraries = OUTPUT / 'lib'
    libraries.mkdir(exist_ok=True)
    package = MODULE / 'target/cloudflow-service-oa-1.0.0.jar'
    application = MODULE / 'target/cloudflow-service-oa-1.0.0.jar.original'
    if not package.is_file() or not application.is_file():
        raise RuntimeError('Build the executable OA package first')
    paths = [application]
    with zipfile.ZipFile(package) as archive:
        for entry in archive.infolist():
            if entry.filename.startswith('BOOT-INF/lib/') and entry.filename.endswith('.jar'):
                destination = libraries / Path(entry.filename).name
                destination.write_bytes(archive.read(entry))
                paths.append(destination)
    classpath = os.pathsep.join(str(path) for path in paths)
    quote = lambda value: '"' + str(value).replace('\\', '/') + '"'
    arguments = ['-encoding', 'UTF-8', '-parameters', '-proc:none', '-cp', quote(classpath),
                 '-d', quote(OUTPUT), quote(SOURCE)]
    compile_args = OUTPUT / 'compile.args'
    compile_args.write_text('\n'.join(arguments), encoding='utf-8')
    with (OUTPUT / 'compile.log').open('w', encoding='utf-8') as stream:
        result = subprocess.run(['javac', '@' + str(compile_args)], cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT)
    if result.returncode:
        print((OUTPUT / 'compile.log').read_text(encoding='utf-8'))
        raise SystemExit(result.returncode)
    arguments = ['-Xmx384m', '-Dfile.encoding=UTF-8', '-cp', quote(str(OUTPUT) + os.pathsep + classpath),
                 'com.cloudflow.oa.service.impl.OaFinalBasicChecks',
                 quote(MODULE / 'src/main/resources/mapper/OaIdentityReferenceMapper.xml'), options.only]
    run_args = OUTPUT / 'run.args'
    run_args.write_text('\n'.join(arguments), encoding='utf-8')
    with (OUTPUT / 'run.log').open('w', encoding='utf-8') as stream:
        result = subprocess.run(['java', '@' + str(run_args)], cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT)
    log = (OUTPUT / 'run.log').read_text(encoding='utf-8', errors='replace')
    print(log if result.returncode else '\n'.join(line for line in log.splitlines() if line.startswith('PASS:')))
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
