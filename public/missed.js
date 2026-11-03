/* Catch up: turns the @tags the server found into a list sorted by urgency.
   Classic script, loaded after collabs.js (it uses its helpers). Everything here is a global.

   How urgency is scored (all points add up, then the collab goes in a tier):
   - Deadline on the collab (not for finished collabs or on hold): late 40 + 2 per day late (up to 60), due today 45,
     tomorrow 32, within 3 days 24, within a week 10.
   - What the message says: urgent wording (asap, today, eod, blocker, overdue…) 25, a request (please, can you,
     need, review, confirm…) 10, a question mark 10; capped at 40. Plain thanks/noted/great: -15 (FYI).
   - Whether it was answered: nobody posted on the collab since: 10 + 3 per day waiting (up to 12 more);
     others replied but you didn't: 3; the person who tagged you posted again (a chase): 10.
   - Collab already finished: -25. On hold: -10.
   - More tags on the same collab: +3 each (up to 2 more).
   Act now >= 65, Today >= 35, otherwise When you can. A tag counts as handled once you posted on that collab
   after it, or you marked it done. */
const MISSED_TIERS=[
  {key:"now",label:"Act now",c:"var(--danger)",min:65,hint:"Late or due collabs, urgent wording, or someone already chasing you."},
  {key:"today",label:"Today",c:"#F59E3B",min:35,hint:"A request is waiting on you, or a deadline is close."},
  {key:"later",label:"When you can",c:"var(--crystal)",min:-1e9,hint:"Low pressure: no near deadline, or it reads as an FYI."},
  {key:"done",label:"Already handled",c:"var(--lume)",min:-1e9,hint:"You replied after the tag, or you marked it done."}
];
const URGENT_WORDS=/\b(urgent|urgently|asap|immediately|right away|eod|end of day|today|tonight|this morning|blocker|blocking|escalat\w*|overdue|deadline|late)\b/i;
const ASK_WORDS=/\b(please|pls|plz|can you|could you|would you|need|needs|kindly|let me know|confirm|approve|approval|review|check|send|share|update|follow up)\b/i;
const THANKS=/^(thanks|thank you|thank u|ty|noted|got it|great|nice|awesome|perfect|cool|ok|okay|done|will do)[\s.!]*$/i;

function stripMe(text,me){
  let t=String(text||"");
  if(me&&me.name)t=t.replace(new RegExp("@"+String(me.name).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"gi"),"");
  return t.replace(/\s+/g," ").trim();
}
/* a collab's details from its raw Monday item; stage is empty for items that aren't on the Production board */
function missedItem(it){
  const stage=cv(it,COL.stage);
  let sub=SUB[stage]?cv(it,SUB[stage]):"";if(sub==="-")sub="";
  const deadline=stage?cv(it,COL.deadline):"";
  const finished=!!stage&&(finishedByColumns(stage,sub)||/^cancell?ed$/i.test(stage));
  return{id:String(it.id),name:String(it.name||"").trim(),url:it.url||"",board:it.board&&it.board.name||"",stage,sub,deadline,
    left:stage?daysUntil(deadline):null,finished,hold:!!stage&&isOnHold(stage,sub),creator:stage?cv(it,COL.creator):"",gone:it.state==="deleted"||it.state==="archived"};
}
function deadlinePoints(d){
  if(!d.stage||d.finished||d.hold||d.left==null)return{pts:0,reason:""};
  if(d.left<0)return{pts:40+Math.min(-d.left,10)*2,reason:timingLabel(d.left)};
  if(d.left===0)return{pts:45,reason:"Due today"};
  if(d.left===1)return{pts:32,reason:"Due tomorrow"};
  if(d.left<=3)return{pts:24,reason:timingLabel(d.left)};
  if(d.left<=7)return{pts:10,reason:timingLabel(d.left)};
  return{pts:0,reason:""};
}
function tagPoints(tag,later,me,now){
  const t=stripMe(tag.text,me),reasons=[];let pts=0;
  const urgent=URGENT_WORDS.test(t),q=/\?/.test(t),ask=ASK_WORDS.test(t);
  if(urgent){pts+=25;reasons.push("Sounds urgent")}
  if(q)pts+=10;
  if(ask)pts+=10;
  if(q||ask)reasons.push(q?"Asks a question":"Asks you to do something");
  pts=Math.min(pts,40);
  if(!q&&t.length<=40&&THANKS.test(t)){pts-=15;reasons.length=0;reasons.push("Looks like an FYI")}
  const others=later.filter(p=>p.byId!==String(me.id)&&p.byId!==tag.byId);
  const chased=later.filter(p=>p.byId===tag.byId);
  const days=Math.floor((now-ts(tag.at))/864e5);
  if(!others.length){pts+=10+Math.min(Math.max(days,0)*3,12);reasons.push(days>=1?`Unanswered for ${days} day${days===1?"":"s"}`:"Unanswered")}
  else{pts+=3;reasons.push("Others replied, not you")}
  if(chased.length){pts+=10;reasons.push(`${firstName(tag.by)} followed up`)}
  return{pts,reasons};
}
/* raw = the server's {me, since, now, posts, items}; done = {postId: markedAt}. Returns entries sorted most urgent first. */
function buildMissed(raw,done){
  done=done||{};
  const me=raw.me||{},now=raw.now||Date.now(),since=raw.since||0;
  const items=new Map((raw.items||[]).map(it=>[String(it.id),missedItem(it)]));
  const byItem=new Map();
  (raw.posts||[]).forEach(p=>{if(!byItem.has(p.itemId))byItem.set(p.itemId,[]);byItem.get(p.itemId).push(p)});
  const entries=[];
  byItem.forEach((posts,itemId)=>{
    const d=items.get(itemId);
    if(!d||d.gone)return;
    const tags=posts.filter(p=>p.tagsMe&&p.byId!==String(me.id)&&ts(p.at)>=since).sort((a,b)=>ts(b.at)-ts(a.at));
    if(!tags.length)return;
    const mine=posts.filter(p=>p.byId===String(me.id));
    const scored=tags.map(tag=>{
      const later=posts.filter(p=>p.id!==tag.id&&ts(p.at)>ts(tag.at));
      const replied=mine.some(p=>ts(p.at)>ts(tag.at));
      const resolved=replied?"You replied":done[tag.id]?"Marked done":"";
      return{...tag,resolved,...tagPoints(tag,later,me,now)};
    });
    const open=scored.filter(t=>!t.resolved);
    const dl=deadlinePoints(d);
    let score=0;const reasons=[];
    if(open.length){
      const top=open.reduce((a,b)=>b.pts>a.pts?b:a);
      score=top.pts+dl.pts+Math.min(2,open.length-1)*3;
      if(dl.reason)reasons.push(dl.reason);
      reasons.push(...top.reasons);
      if(open.length>1)reasons.push(`${open.length} tags`);
      if(d.finished){score-=25;reasons.push("Collab already finished")}
      else if(d.hold){score-=10;reasons.push("On hold")}
    }
    const tier=open.length?MISSED_TIERS.find(t=>t.key!=="done"&&score>=t.min).key:"done";
    entries.push({...d,tags:scored,open,score,tier,reasons:[...new Set(reasons)].slice(0,5),latest:ts(tags[0].at)});
  });
  const rank=e=>MISSED_TIERS.findIndex(t=>t.key===e.tier);
  entries.sort((a,b)=>rank(a)-rank(b)||b.score-a.score||b.latest-a.latest);
  const counts=Object.fromEntries(MISSED_TIERS.map(t=>[t.key,0]));
  entries.forEach(e=>counts[e.tier]++);
  return{entries,counts};
}
