import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateFormExpression, validateFormExpression } from '../../cloudflow-frontend/src/utils/formExpression';

type Case = { name: string; expression: string; fields: string[]; values: Record<string, unknown>; expected: { syntax: boolean; valid: boolean; value: boolean } };
const directory = process.argv[2];
assert.ok(directory && path.isAbsolute(directory));
if (process.argv.includes('--compare')) {
  const front = JSON.parse(fs.readFileSync(path.join(directory,'frontend.json'),'utf8'));
  const back = JSON.parse(fs.readFileSync(path.join(directory,'backend.json'),'utf8'));
  assert.deepEqual(back.results,front.results,'Production frontend/backend predicate results differ');
  assert.equal(back.filterChecksPassed,true);
  console.log(`C3_EXPRESSION_PARITY: cases=${front.results.length}; result_checks=${front.results.length * 3}; filter_checks=${back.filterChecks}; same_corpus=true; passed=true`);
} else {
  const cases: Case[] = [], fields = ['amount','type','flag','text','missing','other'];
  const add = (name:string,expression:string,values:Record<string,unknown>,syntax:boolean,valid:boolean,value:boolean) => cases.push({name,expression,fields,values,expected:{syntax,valid,value}});
  const combination = "${amount} > 10000 && ${type} == 'SPECIAL'";
  for (const [amount, valid] of [[0,true],[10000,true],[10000.01,true],['10000.01',true],['99999999999999999999.99',true],[null,false],[[],false],[{},false],['invalid',false]] as const) {
    for(const type of ['SPECIAL','NORMAL']) add(`amount_${cases.length}_${type}`,combination,{amount,type},true,valid,valid && Number(amount)>10000 && type==='SPECIAL');
  }
  for(const [name,expression,values,value] of [
    ['negative','-1 < 0',{},true],['precedence','true || false && false',{},true],['grouping','(true || false) && false',{},false],
    ['boolean','!${flag}',{flag:false},true],['missing','${missing} == null',{},true],['unicode',"'中文' == '中文'",{},true],
    ['escaped',"'it\\'s' == 'it\\'s'",{},true],['text_identity',"'001' != '1'",{},true],
    ['decimal','${amount} == 10000.01',{amount:'10000.01'},true],['short_circuit','true || ${amount} > 0',{amount:[]},true],
    ['five_parentheses','(((((true)))))',{},true],['five_negations','!!!!!false',{},true],
    ['length_500','true'+' '.repeat(496),{},true],['numeric_string_128','${amount} > 0',{amount:'1'.repeat(128)},true],
  ] as Array<[string,string,Record<string,unknown>,boolean]>)add(name,expression,values,true,true,value);
  for(const [name,expression,values] of [
    ['boolean_type','${amount}',{amount:1}],['null_order','${missing} > 1',{}],['boolean_order','true < false',{}],
    ['numeric_boolean','${flag} == 1',{flag:true}],['numeric_string_129','${amount} > 0',{amount:'1'.repeat(129)}],
  ] as Array<[string,string,Record<string,unknown>]>)add(name,expression,values,true,false,false);
  for(const [name,expression] of [
    ['empty',''],['function',"eval('true')"],['new_function',"new Function('true')"],['method','${amount}.getClass()'],
    ['property','${type.length} > 0'],['script','true;false'],['java_type','T(java.lang.Runtime).getRuntime()'],
    ['unknown','${undeclared} == 1'],['unknown_short_circuit','false && ${undeclared} == 1'],
    ['reserved_constructor','${constructor} == null'],['reserved_proto','${__proto__} == null'],
    ['ternary','true ? 1 : 0'],['arithmetic','${amount} + 1 > 0'],['variable_negation','-${amount} < 0'],
    ['six_parentheses','((((((true))))))'],['six_negations','!!!!!!true'],['length_501','true'+' '.repeat(497)],
    ['unfinished','true &&'],['extra_parenthesis','true)'],['leading_zero','01 == 1'],['unsupported_escape',"'bad\\n' == 'bad'"],
  ])add(name,expression,{},false,false,false);
  const results = cases.map(entry=>{
    const declared = new Set(entry.fields), result = {name:entry.name,syntax:validateFormExpression(entry.expression,declared)===null,...evaluateFormExpression(entry.expression,entry.values,declared)};
    assert.deepEqual({syntax:result.syntax,valid:result.valid,value:result.value},entry.expected,entry.name);return result;
  });
  fs.writeFileSync(path.join(directory,'corpus.json'),JSON.stringify(cases,null,2),{flag:'wx'});
  fs.writeFileSync(path.join(directory,'frontend.json'),JSON.stringify({results},null,2),{flag:'wx'});
  console.log(`C3_EXPRESSION_FRONTEND: cases=${cases.length}; passed=true`);
}
