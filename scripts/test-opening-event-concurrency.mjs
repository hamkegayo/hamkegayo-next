import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(url && /^(http:\/\/(localhost|127\.0\.0\.1))(?::\d+)?$/.test(url),"concurrency test must use local Supabase only");
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
function sql(input) {
    return new Promise((resolve,reject)=>{
        const child=spawn("docker",["exec","-i","supabase_db_my-app","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-q"],{windowsHide:true});
        let errors="";
        child.stderr.on("data",(chunk)=>{errors+=chunk;});
        child.on("error",reject);
        child.on("close",(code)=>code===0?resolve():reject(new Error(errors)));
        child.stdin.end(input);
    });
}
const {data:before,error}=await admin.from("opening_campaign").select("*").single();
assert.ifError(error);
const {count}=await admin.from("opening_event_claims").select("id",{count:"exact",head:true});
assert.equal(count,0,"local campaign must have no existing claims");
assert.equal(before.used_count,0,"local campaign must be unused");
const testSql=readFileSync(new URL("./test-opening-event.sql",import.meta.url),"utf8");
const setup=testSql.slice(testSql.indexOf("insert into auth.users"),testSql.indexOf("-- 관리자 이외"));
try {
    await sql(`begin;${setup}\nupdate public.opening_campaign set active=true,integration_ready=true where id;commit;`);
    const results=await Promise.all(Array.from({length:23},(_,i)=>admin.rpc("reserve_opening_event",{p_payment_id:`00000159-0002-4000-8000-${String(i+1).padStart(12,"0")}`})));
    assert.equal(results.filter((r)=>!r.error).length,20,"23 simultaneous requests must reserve only 20 benefits");
    const {count:held}=await admin.from("opening_event_claims").select("id",{count:"exact",head:true}).eq("state","HELD");
    assert.equal(held,20);
    assert.ok(results.filter((r)=>r.error).every((r)=>r.error.message.includes("campaign_capacity_held")));
    console.log("✅ 23 concurrent reservations: 20 holds, 3 rejected, no over-allocation");
} finally {
    await sql(`begin;
delete from public.opening_event_claims where payment_id::text like '00000159-%';
delete from public.payments where id::text like '00000159-%';
delete from public.reservations where id::text like '00000159-%';
delete from public.opening_event_identities where customer_id::text like '00000159-%';
delete from public.profiles where id::text like '00000159-%';
delete from auth.users where id::text like '00000159-%';
update public.opening_campaign set active=${before.active},integration_ready=${before.integration_ready},used_count=0 where id;
commit;`);
}
