// Local type-check shim only; Supabase supplies Deno and npm imports at runtime.
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}
declare module 'npm:@supabase/supabase-js@2.116.0' {
  export { createClient } from '@supabase/supabase-js'
}
