import './typescript-loader.mjs'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import React from 'react'
import renderer, { act } from 'react-test-renderer'
import assert from 'node:assert/strict'
import test from 'node:test'

// Render the real React application in memory. No screen/browser access.
const storeUrl=new URL('../src/lib/store.ts',import.meta.url).href
registerHooks({
  resolve(specifier,context,next) {
    let resolved
    try { resolved=next(specifier,context) }
    catch(error) {
      if (!specifier.startsWith('.') || /\.[a-z]+$/i.test(specifier)) throw error
      resolved=next(`${specifier}.tsx`,context)
    }
    return resolved.url===storeUrl ? { url:'test:auth-ui-store',shortCircuit:true } : resolved
  },
  load(url,context,next) {
    if(url==='test:auth-ui-store') return { format:'module',shortCircuit:true,source:'export const store=globalThis.authUiStore; export const canEdit=a=>a?.role==="editor"||a?.role==="admin"; export const isAdmin=a=>a?.role==="admin";' }
    if(url.endsWith('.tsx')) return { format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url),'utf8'),{ loader:'tsx',jsx:'automatic',format:'esm' }).code }
    return next(url,context)
  },
})
let state,listener
const events=new EventTarget(),documentEvents=new EventTarget()
globalThis.window={ addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),setInterval,clearInterval,scrollTo(){} }
globalThis.document={ documentElement:{ dataset:{ theme:'dark' } },visibilityState:'visible',addEventListener:documentEvents.addEventListener.bind(documentEvents),removeEventListener:documentEvents.removeEventListener.bind(documentEvents) }
globalThis.location={ hash:'#/',replace(hash){ this.hash=hash; events.dispatchEvent(new Event('hashchange')) } }
globalThis.localStorage={ getItem:key=>key==='hw-tour-seen'?'1':null,setItem(){} }
const reader={ id:'reader',email:'reader@synthetic.invalid',name:'Reader',role:'reader' }
const record=name=>{ state.reads.push(name) }
globalThis.authUiStore={
  mode:'supabase',
  currentUser:()=>state.lookup(),
  subscribeAuth:fn=>{ listener=fn; return()=>{ listener=null } },
  signIn:async()=>{ if(state.signInError) throw Error('Invalid credentials'); state.lookup=async()=>reader; listener(true) },
  signUp:async(email,password,name)=>{ state.signup={ email,password,name }; return { needsConfirmation:true } },
  signOut:async()=>{ state.lookup=async()=>null; listener(false) },
  list:async()=>{ record('items'); return [] },materials:async()=>{ record('materials'); return [] },
  timetable:async()=>{ record('timetable'); return Array.from({ length:5 },()=>Array(9).fill(null)) },changes:async()=>{ record('changes'); return [] },
  people:async()=>{ record('people'); return [] },
  news:{ list:async()=>{ record('news'); return [] },greetings:async()=>{ record('greetings'); return [] } },
}
const { default:App }=await import('../src/App.tsx')
const { default:Post }=await import('../src/pages/Post.tsx')
const { default:People }=await import('../src/pages/People.tsx')
const reset=(account=null)=>{ state={ lookup:async()=>account,reads:[] }; location.hash='#/' }
const text=root=>JSON.stringify(root.toJSON())
async function mount(){ let root; await act(async()=>{ root=renderer.create(React.createElement(App)) }); return root }
async function close(root){ await act(async()=>root.unmount()) }
async function navigate(hash){ await act(async()=>{ location.replace(hash) }) }

test('signed-out deep links expose only authentication and fetch no class data',async()=>{
  for(const hash of ['#/','#/materials','#/people','#/post','#/news?view=birthdays','#/school-calendar']){
    reset(); location.hash=hash
    const root=await mount()
    try {
      assert.match(text(root),/Sign in/)
      assert.equal(root.root.findAllByType('nav').length,0)
      assert.deepEqual(state.reads,[])
      assert.equal(root.root.findAllByType('form').length,1)
    } finally { await close(root) }
  }
})

test('checking authentication never flashes protected content',async()=>{
  reset(); let resolve; state.lookup=()=>new Promise(r=>{ resolve=r })
  const root=await mount()
  try {
    assert.match(text(root),/Checking your session/)
    assert.equal(root.root.findAllByType('nav').length,0)
    assert.deepEqual(state.reads,[])
    await act(async()=>resolve(null))
    assert.match(text(root),/Sign in/)
  } finally { await close(root) }
})

test('successful login redirects to Today, preserves restored sessions, and signs out',async()=>{
  reset(); location.hash='#/people'
  let root=await mount()
  try {
    await act(async()=>root.root.findByType('form').props.onSubmit({ preventDefault(){} }))
    assert.equal(location.hash,'#/')
    assert.match(text(root),/Coming Up/)
    assert.ok(state.reads.includes('items'))
    await close(root)
    root=await mount() // Persisted SDK session, as after a refresh.
    assert.match(text(root),/Coming Up/)
    const button=root.root.findAllByType('button').find(b=>b.children.join('')==='Sign out')
    assert.ok(button,'all roles have a visible, labeled sign-out button')
    await act(async()=>button.props.onClick())
    assert.match(text(root),/Sign in/)
    assert.equal(root.root.findAllByType('nav').length,0)
  } finally { await close(root) }
})

test('reader/editor/admin direct routes enforce interface permissions',async()=>{
  for(const role of ['reader','editor','admin']){
    reset({ ...reader,role })
    const root=await mount()
    try {
      await navigate('#/people')
      assert.equal(root.root.findAllByType(People).length,role==='admin'?1:0)
      assert.equal(state.reads.includes('people'),role==='admin')
      await navigate('#/post')
      assert.equal(root.root.findAllByType(Post).length,role==='reader'?0:1)
      assert.ok(root.root.findAllByType('button').some(b=>b.children.join('')==='Sign out'))
    } finally { await close(root) }
  }
})

test('registration stays available and confirmation does not reveal class data',async()=>{
  reset(); const root=await mount()
  try {
    await act(async()=>root.root.findAllByType('button').find(b=>b.children.join('')==='Sign up').props.onClick())
    const inputs=root.root.findAllByType('input')
    await act(async()=>{
      inputs[0].props.onChange({ target:{ value:'New student' } })
      inputs[1].props.onChange({ target:{ value:'new@synthetic.invalid' } })
      inputs[2].props.onChange({ target:{ value:'synthetic-password' } })
    })
    await act(async()=>root.root.findByType('form').props.onSubmit({ preventDefault(){} }))
    assert.match(text(root),/Check your email/)
    assert.deepEqual(state.signup,{ email:'new@synthetic.invalid',password:'synthetic-password',name:'New student' })
    assert.deepEqual(state.reads,[])
  } finally { await close(root) }
})

test('invalid credentials keep the authentication form and accessible error',async()=>{
  reset(); state.signInError=true
  const root=await mount()
  try {
    await act(async()=>root.root.findByType('form').props.onSubmit({ preventDefault(){} }))
    assert.match(text(root),/Invalid credentials/)
    assert.ok(root.root.findAllByProps({ role:'alert' }).length)
    assert.deepEqual(state.reads,[])
  } finally { await close(root) }
})

test('session expiry removes the class interface and role changes remove admin pages',async()=>{
  reset({ ...reader,role:'admin' })
  const root=await mount()
  try {
    await navigate('#/people')
    assert.equal(root.root.findAllByType(People).length,1)
    state.lookup=async()=>reader
    await act(async()=>{ listener(true); await new Promise(resolve=>setTimeout(resolve,1)) })
    assert.equal(root.root.findAllByType(People).length,0)
    assert.equal(location.hash,'#/')
    await act(async()=>listener(false))
    assert.match(text(root),/Sign in/)
    assert.equal(root.root.findAllByType('nav').length,0)
  } finally { await close(root) }
})

test('failed initial authentication shows an error without loading class data',async()=>{
  reset(); state.lookup=async()=>{ throw Error('Offline') }
  const root=await mount()
  try {
    assert.match(text(root),/Could not check your session/)
    assert.equal(root.root.findAllByType('nav').length,0)
    assert.deepEqual(state.reads,[])
  } finally { await close(root) }
})
