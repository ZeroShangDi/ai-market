import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSchedule,readSchedule,scheduleLabel} from '../ui/schedule.js';
test('calendar controls compile without changing interval or timezone semantics',()=>{
 assert.equal(compileSchedule({kind:'weekly',time:'09:05',weekdays:[5,1,1]}).cron,'5 9 * * 1,5');
 assert.equal(compileSchedule({kind:'monthly',time:'09:00',monthday:31}).cron,'0 9 31 * *');
 assert.equal(compileSchedule({kind:'interval',interval:7,unit:'hours'}).interval_seconds,25200);
 assert.equal(compileSchedule({kind:'once',date:'2028-02-29',time:'10:00',offset:'+08:00'}).run_at,'2028-02-29T10:00:00+08:00');
 for(const s of [{kind:'once',date:'2026-02-29',time:'10:00'},{kind:'weekly',time:'10:00',weekdays:[]},{kind:'interval',interval:0,unit:'hours'}])assert.throws(()=>compileSchedule(s));
 assert.equal(readSchedule({cron:'0 9 1 * 1'}).kind,'custom');
 assert.equal(scheduleLabel({cron:'0 9 * * 1,5'}),'每周一、五 09:00');
});
