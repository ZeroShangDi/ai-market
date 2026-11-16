import Ajv from 'ajv/dist/2020.js';
import schema from './contracts/action.schema.json' with {type:'json'};
const validate=new Ajv({strict:false}).compile(schema);
export const error=code=>Object.assign(new Error(code),{code});
export function actionCopy(input){
 // JSON is the wire boundary. Never pass connection or task metadata to the driver.
 if(!validate(input))throw error('INVALID_ARGUMENT');
 return JSON.parse(JSON.stringify(input));
}
export const operations=Object.freeze(schema.oneOf.map(v=>v.properties.operation.const));
