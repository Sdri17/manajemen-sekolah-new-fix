import { store } from './src/lib/store.js';
console.log(await store.students.length());
const st = [];
await store.students.iterate((v) => { st.push(v); });
console.log(st[0]);
