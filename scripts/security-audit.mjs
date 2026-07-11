import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendRoot = path.join(root, 'cloudflow-backend');
const frontendRoot = path.join(root, 'cloudflow-frontend', 'src');
const dbRoot = path.join(backendRoot, 'DB');

const walk = (dir, predicate) => {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(fullPath, predicate));
    else if (predicate(fullPath)) result.push(fullPath);
  }
  return result;
};

const relative = file => path.relative(root, file).replaceAll('\\', '/');
const permissionPattern = /\b(?:system|workflow|oa|hr|crm):[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)+\b/g;
const javaControllers = walk(backendRoot, file => file.endsWith('.java') && file.includes(`${path.sep}controller${path.sep}`));
const sqlFiles = walk(dbRoot, file => file.endsWith('.sql'));
const frontendFiles = walk(frontendRoot, file => file.endsWith('.ts') || file.endsWith('.tsx'));

const backendPermissions = new Set();
for (const file of walk(backendRoot, file => file.endsWith('.java'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/@SaCheckPermission\s*\([\s\S]*?\)/g)) {
    for (const permission of match[0].match(permissionPattern) ?? []) backendPermissions.add(permission);
  }
}

const databasePermissions = new Set();
for (const file of sqlFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const permission of source.match(permissionPattern) ?? []) databasePermissions.add(permission);
}

const frontendPermissions = new Set();
for (const file of frontendFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const permission of source.match(permissionPattern) ?? []) frontendPermissions.add(permission);
}

const publicControllerFiles = new Set(['CaptchaController.java', 'HealthController.java']);
const explicitlyPublicMappings = [
  /AuthController\.java#.*@PostMapping\("\/login"\)/,
  /AuthController\.java#.*@PostMapping\("\/register"\)/,
  /AuthController\.java#.*@GetMapping\("\/tenant\/options"\)/,
  /LegalAgreementController\.java#.*\/public\//,
];

const unprotectedEndpoints = [];
let endpointCount = 0;
for (const file of javaControllers) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/@(?:Get|Post|Put|Delete|Patch)Mapping\b/.test(lines[index])) continue;
    endpointCount += 1;

    let start = index;
    while (start > 0 && !/^\s*}\s*$/.test(lines[start - 1])) start -= 1;
    let end = index;
    while (end < lines.length - 1 && !/^\s*(?:public|protected|private)\s+/.test(lines[end])) end += 1;
    const annotationBlock = lines.slice(start, Math.min(end + 1, lines.length)).join('\n');
    const prefix = lines.slice(0, index).join('\n');
    const classOffset = Math.max(prefix.lastIndexOf(' class '), prefix.lastIndexOf('\nclass '));
    const classAnnotationBlock = classOffset >= 0 ? prefix.slice(Math.max(0, classOffset - 500)) : '';
    const protectedByPermission = /@SaCheck(?:Login|Permission|Role)\b/.test(annotationBlock)
      || /@SaCheck(?:Login|Permission|Role)\b[\s\S]*?class\s+/.test(classAnnotationBlock);
    const protectedAsInner = /@Inner\b/.test(annotationBlock) || /@Inner\b[\s\S]*?class\s+/.test(source.slice(0, source.indexOf(lines[index])));
    const endpointIdentity = `${relative(file)}#${lines[index].trim()}`;
    const explicitlyPublic = /@SaIgnore\b/.test(annotationBlock)
      || publicControllerFiles.has(path.basename(file))
      || explicitlyPublicMappings.some(pattern => pattern.test(endpointIdentity));

    if (!protectedByPermission && !protectedAsInner && !explicitlyPublic) {
      unprotectedEndpoints.push({ file: relative(file), line: index + 1, mapping: lines[index].trim() });
    }
  }
}

const sortedDifference = (left, right) => [...left].filter(value => !right.has(value)).sort();
const backendMissingDatabase = sortedDifference(backendPermissions, databasePermissions);
const frontendMissingDatabase = sortedDifference(frontendPermissions, databasePermissions);

const result = {
  summary: {
    endpoints: endpointCount,
    backendPermissions: backendPermissions.size,
    databasePermissions: databasePermissions.size,
    frontendPermissions: frontendPermissions.size,
    unprotectedEndpoints: unprotectedEndpoints.length,
    backendMissingDatabase: backendMissingDatabase.length,
    frontendMissingDatabase: frontendMissingDatabase.length,
  },
  unprotectedEndpoints,
  backendMissingDatabase,
  frontendMissingDatabase,
};

console.log(JSON.stringify(result, null, 2));
if (unprotectedEndpoints.length || backendMissingDatabase.length || frontendMissingDatabase.length) {
  process.exitCode = 1;
}
