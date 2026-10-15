import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createAuthSession } from '../src/lib/auth-session.ts'
import { canAccessRoute } from '../src/lib/access.ts'

const reader = { id:'reader',email:'reader@synthetic.invalid',name:null,role:'reader' }
const tick = () => new Promise(resolve => setTimeout(resolve, 1))
const deferred = () => { let resolve; const promise = new Promise(r => { resolve=r }); return { promise,resolve } }
function setup(lookup = async () => reader) {
  let listener, redirects=0, unsubscribed=false, calls=0
  const source = { currentUser: () => { calls++; return lookup() },subscribeAuth:fn => { listener=fn; return () => { unsubscribed=true } },signOut:async () => listener(false) }
  const auth = createAuthSession(source, () => redirects++)
  return { auth,source,emit: value => listener(value),start: () => auth.start(),calls: () => calls,redirects: () => redirects,unsubscribed: () => unsubscribed }
}

test('auth starts checking, restores persisted identity, and redirects once', async () => {
  const request=deferred(), f=setup(() => request.promise)
  assert.equal(f.auth.getSnapshot().status,'checking')
  const stop=f.start()
  assert.equal(f.auth.getSnapshot().user,null)
  request.resolve(reader); await tick()
  assert.equal(f.auth.getSnapshot().status,'signed-in')
  assert.deepEqual(f.auth.getSnapshot().user,reader)
  assert.equal(f.redirects(),1)
  await f.auth.refresh()
  assert.equal(f.redirects(),1)
  stop(); assert.equal(f.unsubscribed(),true)
})

test('unauthenticated and failed checks never supply a protected account', async () => {
  for (const lookup of [async () => null,async () => { throw Error('Offline') }]) {
    const f=setup(lookup), stop=f.start()
    await tick()
    assert.equal(f.auth.getSnapshot().status,'signed-out')
    assert.equal(f.auth.getSnapshot().user,null)
    assert.equal(f.redirects(),0)
    stop()
  }
})

test('signout event invalidates pending profile requests immediately', async () => {
  const request=deferred(),f=setup(() => request.promise),stop=f.start()
  f.emit(false)
  assert.equal(f.auth.getSnapshot().status,'signed-out')
  request.resolve({ ...reader,role:'admin' }); await tick()
  assert.equal(f.auth.getSnapshot().user,null)
  stop()
})

test('auth events defer Supabase calls and discard stale refresh results', async () => {
  const requests=[deferred(),deferred(),deferred()]
  let index=0
  const f=setup(() => requests[index++].promise),stop=f.start()
  requests[0].resolve(reader); await tick()
  f.emit(true)
  assert.equal(f.auth.getSnapshot().status,'checking')
  assert.equal(f.calls(),1,'no query inside auth callback')
  await tick()
  f.emit(true); await tick()
  requests[2].resolve({ ...reader,role:'reader' }); await tick()
  requests[1].resolve({ ...reader,role:'admin' }); await tick()
  assert.equal(f.auth.getSnapshot().user.role,'reader')
  stop()
})

test('failed signout stays locked against refresh events until explicit login', async () => {
  const f=setup(),stop=f.start()
  await tick()
  const request=deferred()
  f.source.signOut=() => request.promise
  const signingOut=f.auth.signOut()
  f.emit(true); await tick()
  assert.equal(f.auth.getSnapshot().user,null)
  request.resolve(); await signingOut
  f.source.signOut=async () => { throw Error('Offline') }
  await f.auth.signOut()
  assert.match(f.auth.getSnapshot().error,/Sign out could not finish/)
  f.emit(true); await tick()
  assert.equal(f.auth.getSnapshot().user,null)
  await f.auth.refresh()
  assert.equal(f.auth.getSnapshot().user.role,'reader')
  stop()
})

test('cleanup prevents stale authentication from being published', async () => {
  const request=deferred(),f=setup(() => request.promise),stop=f.start()
  stop(); request.resolve(reader); await tick()
  assert.equal(f.auth.getSnapshot().user,null)
})

test('route guards preserve Reader, Editor, Admin and separate news-manager roles', () => {
  for (const route of ['today','schedule','materials','school-calendar','news','post','people']) assert.equal(canAccessRoute(null,route),false)
  for (const role of ['reader','editor','admin']) {
    const account={ ...reader,role }
    for (const route of ['today','schedule','materials','school-calendar','news']) assert.equal(canAccessRoute(account,route),true)
    assert.equal(canAccessRoute(account,'post'),role!=='reader')
    assert.equal(canAccessRoute(account,'people'),role==='admin')
  }
  assert.equal(canAccessRoute({ ...reader,news_manager:true },'post'),false)
  assert.equal(canAccessRoute({ ...reader,news_manager:true },'people'),false)
})
