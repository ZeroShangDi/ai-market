<template><view/></template><script setup lang="ts">import{onLoad}from'@dcloudio/uni-app';import{loginUrl}from'@/modules/auth-navigation';onLoad(()=>uni.redirectTo({url:loginUrl()}));</script>
