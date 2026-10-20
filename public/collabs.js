/* Shared collab logic: the Monday.com columns, the digest's grouping rules and the loader.
   Used by the digest and the Home snapshot so both count collabs the same way.
   Classic script: everything here is a global. */
const COL={stage:"color_mm26weve",deadline:"date_mm3rpv64",delays:"formula_mm5exx7",creator:"board_relation_mm57zxnz",cfs:"multiple_person_mm2677g0",
  days:"formula_mm26np49",stageStart:"date_mm26qbn7"};
/* sub-stage column per stage */
const SUB={"Creative Direction":"color_mm26m684","Production":"color_mm265k74","Post-Production":"color_mm266ame","QC - Production":"color_mm26y3mc",
  "QC - Post-Production":"color_mm57fna8","Client Review":"color_mm26qtzn"};
const SUB_IDS=Object.values(SUB);

const GROUPS=[
  {key:"needsYou",label:"Needs you",c:"var(--violet)"},
  {key:"dueToday",label:"Due today",c:"#F59E3B"},
  {key:"late",label:"Late",c:"var(--danger)"},
  {key:"changed",label:"Changed 24h",c:"var(--crystal)"},
  {key:"waiting",label:"Waiting on client",c:"#9cd326"},
  {key:"stuck",label:"Stuck 5d+",c:"var(--gold)"},
  {key:"other",label:"Everything else",c:"var(--muted)"}
];
const STAGE_HEX={"Canceled":"#df2f4a","Planning":"#66ccff","Creative Direction":"#ffcb00","Creator Assignment":"#fdab3d","Production":"#9d50dd",
  "QC - Production":"#784bd1","Post-Production":"#579bfc","QC - Post-Production":"#5a86d6","Client Review":"#9cd326","Revision":"#ff007f","Revisions":"#ff007f",
  "Upload":"#ff5ac4","On Hold":"#8a8a99","Approved":"#00c875","Completed":"#16a36b","Posting":"#4a8ff0","In Progress":"#fdab3d","Done":"#00c875","Stuck":"#df2f4a"};
const YOUR_MOVE=/^(pending asset|needs clarification|revisions?|creator reassignment|contracting|product access)$/i;
const tz="Asia/Manila";

const norm=s=>String(s||"").trim().toLowerCase();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function ago(iso){if(!iso)return"";const d=new Date(iso);if(isNaN(d))return"";const m=Math.round((Date.now()-d)/6e4);
  if(m<1)return"just now";if(m<60)return m+" min ago";const h=Math.round(m/60);if(h<48)return h+" h ago";return Math.round(h/24)+" days ago"}
const dayNum=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||"");return m?Date.UTC(+m[1],m[2]-1,+m[3])/864e5:null};
const todayNum=()=>dayNum(new Intl.DateTimeFormat("en-CA",{timeZone:tz}).format(new Date()));
function daysUntil(deadline){const d=dayNum(deadline);return d==null?null:d-todayNum()}
function timingLabel(left){
  if(left==null)return"";
  if(left<0)return`${-left} day${left===-1?"":"s"} late`;
  if(left===0)return"Due today";
  return left===1?"Due tomorrow":`Due in ${left} days`;
}
function dueDate(s){if(!s)return null;const d=new Date(s.length<=10?s+"T23:59:59+08:00":s);return isNaN(d)?null:d}
function fmtDue(s){const d=dueDate(s);return d?d.toLocaleDateString("en-US",{timeZone:tz,month:"short",day:"numeric",year:"numeric"}):""}
function fmtWhen(iso){const d=new Date(iso);return isNaN(d)?"":d.toLocaleDateString("en-US",{timeZone:tz,month:"short",day:"numeric"})}
const ts=s=>{const d=s?new Date(s):null;return d&&!isNaN(d)?d.getTime():0};
const oneLine=s=>String(s||"").replace(/\s+/g," ").trim();

/* ---------- Monday → item rows ---------- */
function clientOf(name){const t=String(name||"").replace(/^[^A-Za-z0-9]+/,"").split("_")[0].trim();return t||"Other"}
function cv(it,id){const c=(it.column_values||[]).find(x=>x.id===id);if(!c)return"";const v=c.display_value??c.text;return v==null?"":String(v).trim()}
function latestPost(updates){
  let best=null;
  (updates||[]).forEach(u=>{
    if(!best||ts(u.created_at)>ts(best.created_at))best={...u,isReply:false,replyTo:""};
    (u.replies||[]).forEach(r=>{if(!best||ts(r.created_at)>ts(best.created_at))best={...r,isReply:true,replyTo:u.creator?.name||""}});
  });
  return best;
}
/* stage-only exclusions, decided before any updates are read */
function finishedByColumns(stageName,sub){
  const st=norm(stageName),sb=norm(sub);
  return st==="approved"||st==="completed"||sb==="completed"||(st==="client review"&&sb==="posted");
}
function buildRow(it,updates,me){
  const stageName=cv(it,COL.stage)||"No stage";
  let sub=SUB[stageName]?cv(it,SUB[stageName]):"";
  if(sub==="-")sub="";
  if(!sub){const any=SUB_IDS.map(id=>cv(it,id)).filter(v=>v&&v!=="-");sub=stageName==="Planning"?"":(any[any.length-1]||"")}
  const creator=cv(it,COL.creator);
  const daysRaw=parseInt(cv(it,COL.days),10),days=isNaN(daysRaw)?null:daysRaw;
  const deadline=cv(it,COL.deadline),stageStart=cv(it,COL.stageStart);
  const p=latestPost(updates),meName=norm(me&&me.name);
  const text=oneLine(p&&p.text_body);
  const by=p&&p.creator?p.creator.name:"";
  const mentionsMe=!!(p&&meName&&norm(text).includes("@"+meName)&&norm(by)!==meName);
  let mention=null;
  if(meName)(updates||[]).forEach(u=>[u,...(u.replies||[])].forEach(x=>{
    if(norm(x.creator&&x.creator.name)!==meName&&norm(x.text_body).includes("@"+meName)&&(!mention||ts(x.created_at)>ts(mention.created_at)))mention=x}));
  const row={id:it.id,name:String(it.name||"").trim(),url:it.url,stage:stageName,subStage:sub,creator,deadline,delays:"",daysInStage:days,
    mentionsMe,mentionAt:mention?mention.created_at:"",mentionBy:mention&&mention.creator?mention.creator.name:"",latest:p?{text:text.length>220?text.slice(0,217)+"…":text,by,at:p.created_at,isReply:p.isReply,replyTo:p.replyTo}:{} };
  /* exclusions that need the posts */
  const handoff=p&&meName&&norm(by)===meName&&/spark/i.test(text)&&(/post(ed)?\s*link/i.test(text)||/https?:\/\/\S*(tiktok|instagram|youtu)/i.test(text));
  const notStarted=(stageName==="Planning"||stageName==="Creative Direction")&&!creator&&!p;
  if(finishedByColumns(stageName,sub)||handoff||notStarted)return null;
  /* timing */
  const d=dueDate(deadline),now=Date.now();
  /* Timing comes from the deadline date in Manila calendar days. The Delays formula isn't used:
     through the API it reads "0.5 days late" on the deadline day itself, while the board shows "Deadline today". */
  const left=daysUntil(deadline);
  row.overdue=left!=null&&left<0;
  row.daysLate=row.overdue?-left:0;
  row.dueToday=left===0;
  row.delays=timingLabel(left);
  const dueToday=row.dueToday;
  row.stageStart=stageStart;
  const stageMoved=!!stageStart&&now-ts(stageStart+"T00:00:00+08:00")<864e5;
  const fresh=p&&now-ts(p.created_at)<864e5;
  const isCR=stageName==="Client Review";
  row.client=clientOf(row.name);
  /* group, first match wins */
  /* In Post-Production a Pending Asset comes from the PP Manager, not the CFS */
  const ppAsset=stageName==="Post-Production"&&/^pending asset$/i.test(sub);
  const move=ppAsset?null:[sub,stageName].find(v=>YOUR_MOVE.test(v||""));
  if(mentionsMe){row.group="needsYou";row.reason=`${by||"Someone"} mentioned you${p.isReply?" in a comment":""}`}
  else if(move){row.group="needsYou";row.reason=`Your move: ${move}${days!=null?`, ${days}d in stage`:""}`}
  else if(dueToday&&!isCR){row.group="dueToday";row.reason="Due today: still time to save it"}
  else if(row.overdue&&!isCR){row.group="late";row.reason=row.daysLate?`${row.daysLate} day${row.daysLate===1?"":"s"} late`:"Less than a day late"}
  else if(fresh||stageMoved){row.group="changed";row.reason=fresh?`New ${p.isReply?"comment":"update"} from ${by||"someone"} ${ago(p.created_at)}`:`Moved to ${stageName} today`}
  else if(isCR){row.group="waiting";row.reason=`Waiting on the client${days!=null?` for ${days} day${days===1?"":"s"}`:""}${row.overdue?`, ${row.daysLate}d past deadline`:""}`}
  else if(days!=null&&days>=5){row.group="stuck";row.reason=ppAsset?`Waiting on the PP Manager for the asset, ${days} days`:`${days} days in ${stageName}${sub?` · ${sub}`:""}`}
  else{row.group="other";row.reason=ppAsset?"Waiting on the PP Manager for the asset":""}
  return row;
}

/* ---------- loading ---------- */
async function api(path,body){
  let r;
  try{r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify(body||{})})}
  catch(e){throw{code:"server_unavailable"}}
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
    const err=data.error||{code:"server_unavailable",message:"HTTP "+r.status};
    if((err.code==="monday_not_connected"||err.code==="monday_token")&&window.Shell&&Shell.connectMonday)Shell.connectMonday(err.code);
    throw err;
  }
  return data;
}
/* Active collabs + their latest updates in one request. prev is the last raw copy (or null): updates
   for items that haven't changed since are reused, and only the changed ones are re-read on the server. */
async function fetchDigestRaw(prev,fresh){
  const have={};
  if(prev&&prev.items)prev.items.forEach(it=>{const id=String(it.id);if(prev.updates&&prev.updates[id])have[id]=it.updated_at});
  const p=await api("/api/monday",{op:"digest",have,fresh:!!fresh});
  const got=new Set((p.fetched||[]).map(String)),updates={};
  (p.items||[]).forEach(it=>{const id=String(it.id);updates[id]=got.has(id)?(p.updates[id]||[]):(prev&&prev.updates&&prev.updates[id])||[]});
  return{me:p.me,items:p.items||[],updates};
}
/* raw → {me, groups, dropped} with the digest's rules */
function groupDigest(raw){
  const items=(raw.items||[]).map(it=>({...it,id:String(it.id)}));
  const active=items.filter(it=>{const s=cv(it,COL.stage);return!finishedByColumns(s,SUB[s]?cv(it,SUB[s]):"")});
  const groups=Object.fromEntries(GROUPS.map(g=>[g.key,[]]));
  let dropped=items.length-active.length;
  active.forEach(it=>{const row=buildRow(it,raw.updates[it.id],raw.me);if(row)groups[row.group].push(row);else dropped++});
  return{me:raw.me,groups,dropped};
}
async function fetchCollabs(){return groupDigest(await fetchDigestRaw(null,false))}
const fetchKpiRaw=fresh=>api("/api/monday",{op:"kpi",fresh:!!fresh});

/* ---------- saved copies: pages show the last data at once, then swap in the fresh read ---------- */
const CACHE_PREFIX="cd.cache.v2:";
function cacheRead(kind){try{const c=JSON.parse(localStorage.getItem(CACHE_PREFIX+kind)||"null");return c&&Date.now()-c.at<864e5?c:null}catch(e){return null}}
function cacheWrite(kind,email,data){try{localStorage.setItem(CACHE_PREFIX+kind,JSON.stringify({at:Date.now(),email,data}))}catch(e){}}
const savedAgo=at=>{const m=Math.round((Date.now()-at)/6e4);return m<1?"just now":m<60?m+" min ago":Math.round(m/60)+" h ago"};
/* Starts the fresh read straight away (alongside the sign-in check), renders the saved copy for this
   user if there is one, then renders the fresh data. render(data, {cached, at}). Throws on load errors.
   Returns the config, or {signedIn:false} when the gate should show. */
async function swr(kind,loader,render){
  const saved=cacheRead(kind);
  const freshP=loader(saved&&saved.data);freshP.catch(()=>{});
  const cfg=await Shell.config;
  if(!cfg.signedIn)return cfg;
  if(!cfg.monday)return cfg;   /* the shell shows "Connect your Monday.com" */
  swr.email=cfg.user.email;
  document.getElementById("app").hidden=false;
  if(saved&&saved.email===swr.email)render(saved.data,{cached:true,at:saved.at});
  const fresh=await freshP;
  cacheWrite(kind,swr.email,fresh);render(fresh,{cached:false,at:Date.now()});
  return cfg;
}

/* ---------- handled marks (saved per browser under cd.handled) ---------- */
/* A mark holds until the main stage moves or someone @mentions you after you marked it. */
function readHandled(){try{return JSON.parse(localStorage.getItem("cd.handled")||"{}")||{}}catch(e){return{}}}
function backReasonFor(handled,it){
  const h=handled[it.id];if(!h)return"";
  if(h.stage!==it.stage)return`moved to ${it.stage}`;
  const since=ts(h.markedAt)||ts(h.at);
  if(it.mentionAt&&ts(it.mentionAt)>since)return`${it.mentionBy||"someone"} mentioned you`;
  return"";
}
function isHandledIn(handled,it){return!!handled[it.id]&&!backReasonFor(handled,it)}

/* ---------- creators ---------- */
/* the creator column can hold several people: "Ava K, Ben Lim" */
const creatorNames=s=>String(s||"").split(/\s*,\s*/).map(x=>x.trim()).filter(Boolean);
const firstName=s=>String(s||"").trim().split(/\s+/)[0]||"there";
const shortDue=s=>{const d=dueDate(s);return d?d.toLocaleDateString("en-US",{timeZone:tz,month:"short",day:"numeric"}):""};
/* the next step is the creator's: filming, revisions, or something they owe (a Post-Production
   Pending Asset is the PP Manager's, not the creator's) */
const CREATOR_STAGES=/^(creator assignment|production|revisions?)$/i;
function creatorOwes(r){
  const ppAsset=r.stage==="Post-Production"&&/^pending asset$/i.test(r.subStage);
  return CREATOR_STAGES.test(r.stage)||(!ppAsset&&YOUR_MOVE.test(r.subStage||""));
}
const isLate=r=>r.overdue&&creatorOwes(r);
