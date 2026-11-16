import type {Action,ActionResult,Operator} from '../operator/index.mjs';
export class AppFunctions {register(definition:{id:string;packageName:string;versionRange:string;functions:Record<string,Function>}):void;discover(packageName:string,version:string):any[]}
export class Runtime {
 constructor(operator:Operator,options?:{minIntervalMs?:number;maxPerMinute?:number;queueLimit?:number;functions?:AppFunctions});
 execute(action:Action,options?:{signal?:AbortSignal;expectedPackage?:string}):Promise<ActionResult>;
 waitFor(condition:any,options?:{timeoutMs?:number;pollMs?:number;signal?:AbortSignal}):Promise<ActionResult>;
 discoverApps(packageName:string,version:string):any[];
 invokeApp(input:any,options?:{signal?:AbortSignal}):Promise<any>;
 setAppRule(packageName:string,rule:string):any; appRule(packageName:string):string; summaries():any[]; pause():any; resume():any; stop():any; close():Promise<void>;
}
