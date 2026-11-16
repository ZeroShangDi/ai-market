import{test}from'node:test';import assert from'node:assert/strict';import{swipePath,w3cTouchActions}from'../src/gestures.mjs';
test('curve stays bounded, preserves endpoints and duration, and emits one continuous touch',()=>{
 const args={from:{x:10,y:20},to:{x:90,y:190},width:100,height:200,durationMs:600};const points=swipePath(args);assert.deepEqual(points,swipePath(args));assert.deepEqual(points[0],{x:10,y:20,timeMs:0});assert.deepEqual(points.at(-1),{x:90,y:190,timeMs:600});assert(points.every(p=>p.x>=0&&p.x<100&&p.y>=0&&p.y<200));
 const actions=w3cTouchActions(points).actions[0].actions;assert.equal(actions.filter(a=>a.type==='pointerDown').length,1);assert.equal(actions.at(-1).type,'pointerUp');assert.equal(actions.reduce((sum,a)=>sum+(a.duration||0),0),600);
});
test('invalid geometry or timeline is rejected before device dispatch',()=>{assert.throws(()=>swipePath({from:{x:-1,y:0},to:{x:10,y:20},width:100,height:100}));assert.throws(()=>w3cTouchActions([{x:1,y:1,timeMs:0},{x:2,y:2,timeMs:0}]));});
