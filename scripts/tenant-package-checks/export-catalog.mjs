import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepository, replayFormal } from '../check-batch-h-contracts.mjs';
import { numeric, text } from '../check-batch-h-contracts-sql.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (path.parse(root).root.toLowerCase() === `${process.env.SystemDrive}\\`.toLowerCase()) throw new Error('Data drive required');
const output = path.join(root, 'cloudflow-backend/cloudflow-auth/target/tenant-package-checks');
const memory = replayFormal(loadRepository()).memory;
const menus = memory.rows('sys_menu');
const rows = menus.map(menu => [numeric(menu.menu_id), numeric(menu.parent_id), text(menu.menu_type), text(menu.status), text(menu.perms) ?? ''].join('\t'));
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'catalog.tsv'), `${rows.join('\n')}\n`);
const employees = memory.rows('sys_role_menu').filter(row => numeric(row.role_id) === 5).map(row => numeric(row.menu_id));
fs.writeFileSync(path.join(output, 'employee.txt'), `${employees.join('\n')}\n`);
console.log(`TENANT_PACKAGE_FORMAL_CATALOG: menus=${menus.length}; employee_menu_ids=${employees.length}; source=formal_sql_replay`);
