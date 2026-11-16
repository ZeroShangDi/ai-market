import {Operator} from '../operator/index.mjs';
import {NativeDriver} from '../operator/native-driver';
import {Runtime} from './index.mjs';
import {AppFunctions} from '../adapters/index.mjs';
// App-local runtime is created only when a control entry is explicitly used.
// No networking, Agent planning or permission enabling happens on import.
export function createAppRuntime(){
 const driver=new NativeDriver();
 const functions=new AppFunctions();
 return {runtime:new Runtime(new Operator(driver),{functions}),functions,available:()=>driver.available(),operations:()=>driver.available()?[...driver.capabilities]:[]};
}
