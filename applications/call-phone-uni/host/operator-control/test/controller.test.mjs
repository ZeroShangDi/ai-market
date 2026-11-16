import {test}from'node:test';import assert from'node:assert/strict';import{StandardController,normalizePortalState}from'../src/controller.mjs';
const state=()=>({phone_state:{packageName:'com.example'},a11y_tree:{text:'secret',isPassword:true,isClickable:true,isEnabled:true,isVisibleToUser:true,boundsInScreen:{left:0,top:0,right:100,bottom:50},children:[]}});
test('snapshot redacts password text, checks freshness and actionability before coordinates',async()=>{
 let current=state(),calls=0;const controller=new StandardController({observe:async()=>current,dispatch:async()=>{calls++;return {status:'dispatched'};}});
 const snap=normalizePortalState(current);assert.equal(snap.nodes[0].text,'');const request={operation:'click',arguments:{snapshotId:snap.snapshotId,nodeRef:'n:0',expectedPackage:'com.example'}};
 await controller.execute(request);assert.equal(calls,1);current.phone_state.packageName='com.other';await assert.rejects(controller.execute(request),{code:'STALE_SNAPSHOT'});assert.equal(calls,1);
});
