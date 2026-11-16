export interface Action {operation:string;arguments:Record<string,unknown>}
export interface ActionResult {status:'completed'|'dispatched'|'failed'|'unknown';verified:false;data?:any;error?:{code:string}}
export interface Driver {capabilities:readonly string[];observe(options?:any):Promise<any>;perform(action:Action,options?:any):Promise<ActionResult>}
export const operations:readonly string[];
export function resolveTarget(snapshot:any,target:any,options?:any):any;
export class Operator {constructor(driver:Driver);execute(action:Action,options?:{signal?:AbortSignal;gesture?:Function}):Promise<ActionResult>}
