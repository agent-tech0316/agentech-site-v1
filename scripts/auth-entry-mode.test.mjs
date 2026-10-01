import test from 'node:test';
import assert from 'node:assert/strict';
const {initialAuthMode}=await import('../lib/auth-entry-mode.ts');
test('registration stays the default and recovery links open recovery',()=>{
 assert.equal(initialAuthMode(null),'signup');assert.equal(initialAuthMode('forgot'),'forgot');assert.equal(initialAuthMode('signin'),'signin');assert.equal(initialAuthMode('https://evil.invalid'),'signup');
});
