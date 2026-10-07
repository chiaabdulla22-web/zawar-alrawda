// زوار الروضة — backend (no npm dependencies). Run: node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,DIR=path.join(__dirname,'data'),FILE=path.join(DIR,'db.json'),PUB=path.join(__dirname,'public'),PH=path.join(DIR,'photos');
fs.mkdirSync(PH,{recursive:true});
const hash=(p,s)=>crypto.scryptSync(String(p),s,32).toString('hex');
const mk=(u,p,role)=>{const s=crypto.randomBytes(8).toString('hex');return{u,s,h:hash(p,s),role}};
const ok=(U,p)=>{try{return crypto.timingSafeEqual(Buffer.from(hash(p,U.s)),Buffer.from(U.h))}catch{return false}};
let db=fs.existsSync(FILE)?JSON.parse(fs.readFileSync(FILE)):{users:[mk('هەڵمەت','123','admin')],recs:[],log:[],notes:[],staff:[],prices:[],seq:0};
const save=()=>fs.writeFileSync(FILE,JSON.stringify(db));save();
const TZ='Asia/Baghdad',now=()=>{const d=new Date();return{d:d.toLocaleDateString('en-CA',{timeZone:TZ}),t:d.toLocaleTimeString('en-GB',{timeZone:TZ})}};
const sessions=new Map(),clients=new Set();
const push=(ev,data,adminOnly)=>clients.forEach(c=>{if(!adminOnly||c.role==='admin')c.res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`)});
const log=(u,a,d)=>{const n=now();db.log.unshift({t:n.d+' '+n.t,u,a,d:d||''});db.log=db.log.slice(0,2000)};
const note=m=>{const n=now();db.notes.unshift({t:n.d+' '+n.t,m});db.notes=db.notes.slice(0,200);push('note',{m},true)};
const body=req=>new Promise(r=>{let b='';req.on('data',c=>{b+=c;if(b.length>8e6)req.destroy()});req.on('end',()=>{try{r(JSON.parse(b||'{}'))}catch{r({})}})});
const F=['name','pass','trip','tr','srv','acc','hotel','tel','date','agent','cur','price','paid','note'];
const MIME={'.html':'text/html;charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.js':'text/javascript','.css':'text/css'};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://x'),P=url.pathname;
 const send=(c,o)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
 if(!P.startsWith('/api/')){
  const f=path.join(PUB,decodeURIComponent(P==='/'?'/index.html':P));
  if(!f.startsWith(PUB)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end()}
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});return fs.createReadStream(f).pipe(res);
 }
 if(P==='/api/login'){
  const b=await body(req),U=db.users.find(x=>x.u===b.u);
  if(!U||!ok(U,b.p))return send(401,{e:'ناوی بەکارهێنەر یان وشەی نهێنی هەڵەیە'});
  const token=crypto.randomBytes(24).toString('hex');sessions.set(token,{u:U.u,role:U.role});
  log(U.u,'چوونە ژوورەوە');note('چوونە ژوورەوە: '+U.u);save();return send(200,{token,u:U.u,role:U.role});
 }
 const me=sessions.get(req.headers['x-token']||url.searchParams.get('t'));
 if(!me)return send(401,{e:'بچۆ ژوورەوە'});
 const adm=me.role==='admin',deny=()=>send(403,{e:'تەنها بۆ بەڕێوەبەر ڕێگەپێدراوە'});
 if(P==='/api/events'){
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});res.write('\n');
  const c={res,role:me.role};clients.add(c);req.on('close',()=>clients.delete(c));return;
 }
 if(P==='/api/data'){
  const o={recs:db.recs,seq:db.seq,prices:db.prices};
  if(adm)Object.assign(o,{users:db.users.map(u=>({u:u.u,role:u.role})),staff:db.staff,log:db.log.slice(0,300),notes:db.notes.slice(0,50)});
  return send(200,o);
 }
 if(P==='/api/photo'&&req.method==='GET'){
  const f=path.join(PH,path.basename(url.searchParams.get('id')||'')+'.jpg');
  if(!fs.existsSync(f)){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':'image/jpeg'});return fs.createReadStream(f).pipe(res);
 }
 const b=await body(req);
 if(P==='/api/rec'){
  const r={};F.forEach(k=>r[k]=String(b.rec[k]??'').slice(0,500));let x=db.recs.find(q=>q.id===b.rec.id);
  if(x){Object.assign(x,r);log(me.u,'دەستکاریکردن','پسوڵە '+x.no+' — '+x.name)}
  else{const n=now();x={...r,id:Date.now(),no:++db.seq,d:n.d,t:n.t,by:me.u};db.recs.push(x);log(me.u,'زیادکردنی پسوڵە','پسوڵە '+x.no+' — '+x.name);note('تۆمارێکی نوێ: '+x.name+' (پسوڵە '+x.no+') لەلایەن '+me.u)}
  save();push('sync',{});return send(200,x);
 }
 if(P==='/api/photo'){
  const x=db.recs.find(q=>q.id===b.id),m=/^data:image\/jpeg;base64,(.+)$/.exec(b.data||'');
  if(!x||!m)return send(400,{e:'هەڵە'});fs.writeFileSync(path.join(PH,x.id+'.jpg'),Buffer.from(m[1],'base64'));x.photo=true;log(me.u,'وێنە','پسوڵە '+x.no);save();push('sync',{});return send(200,{});
 }
 if(P==='/api/del'){
  const U=db.users.find(u=>u.u===me.u);if(!ok(U,b.password))return send(403,{e:'وشەی نهێنی هەڵەیە'});
  const x=db.recs.find(q=>q.id===b.id);if(!x)return send(404,{e:'نەدۆزرایەوە'});
  db.recs=db.recs.filter(q=>q!==x);try{fs.unlinkSync(path.join(PH,x.id+'.jpg'))}catch{}
  log(me.u,'سڕینەوە','پسوڵە '+x.no+' — '+x.name);note(me.u+' پسوڵەی '+x.no+' سڕییەوە');save();push('sync',{});return send(200,{});
 }
 if(P==='/api/pass'){const U=db.users.find(u=>u.u===me.u);if(!b.p)return send(400,{e:'هەڵە'});Object.assign(U,mk(U.u,b.p,U.role));log(me.u,'گۆڕینی وشەی نهێنی');save();return send(200,{})}
 if(!adm)return deny();
 if(P==='/api/user'){
  if(!b.u||!b.p||db.users.some(u=>u.u===b.u))return send(400,{e:'ئەم ناوە پێشتر هەیە یان خانەکان بەتاڵن'});
  db.users.push(mk(b.u,b.p,b.role==='admin'?'admin':'emp'));log(me.u,'زیادکردنی ئەکاونت',b.u);save();push('sync',{});return send(200,{});
 }
 if(P==='/api/staff'||P==='/api/price'){
  const k=P==='/api/staff'?'staff':'prices';db[k].push(k==='staff'?{name:String(b.name),salary:String(b.amount),cur:b.cur}:{name:String(b.name),amount:String(b.amount),cur:b.cur});
  log(me.u,k==='staff'?'زیادکردنی فەرمانبەر':'زیادکردنی نرخ',b.name);save();push('sync',{});return send(200,{});
 }
 if(P==='/api/remove'&&['staff','prices'].includes(b.kind)){db[b.kind].splice(b.i,1);log(me.u,'سڕینەوە',b.kind);save();push('sync',{});return send(200,{})}
 send(404,{});
}).listen(PORT,'0.0.0.0',()=>console.log('http://localhost:'+PORT));
setInterval(()=>clients.forEach(c=>c.res.write(': ping\n\n')),25000);
