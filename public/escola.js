const $ = (selector) => document.querySelector(selector);
const school = $("#school");
const state = { user: null, times: {}, lessons: [], dispose: null, mode: "login", filter: {}, revision: 0 };
const paths = {
  user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 2.7-6 7-6s7 2 7 6"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.6"/>',
  eyeoff:'<path d="m3 3 18 18M9 6.5c6-2.1 11 3.2 13 5.5a21 21 0 0 1-3 3M6 7.5C4 9 2 12 2 12s4 6 10 6a13 13 0 0 0 3-.4"/>',
  login:'<path d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5M3 12h12m-5-5 5 5-5 5"/>',
  board:'<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 9h18M3 15h18M9 3v18m6-18v18"/><path d="M3 3h6v6H3Zm12 0h6v6h-6ZM9 9h6v6H9Zm-6 6h6v6H3Zm12 0h6v6h-6Z" fill="currentColor" stroke="none" opacity=".44"/>',
  shield:'<path d="M12 3c2.4 2.1 5.5 3.1 8 3.6v5.1c0 4.4-2.9 7.9-8 10.3-5.1-2.4-8-5.9-8-10.3V6.6C6.5 6.1 9.6 5.1 12 3Z"/><path d="M12 8v8"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6.5V12l4 2"/>',
  book:'<path d="M3 5c4-1 6.5-.1 9 1.5C14.5 4.9 17 4 21 5v14c-3.5-.9-6.5 0-9 1.5-2.5-1.5-5.5-2.4-9-1.5Zm9 1.5v14"/>',
  back:'<path d="m14 6-6 6 6 6"/>',next:'<path d="m9 6 6 6-6 6"/>',
  search:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5.5 5.5"/>'
};
function icon(name) {
  const template = document.createElement("template");
  template.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+paths[name]+'</svg>';
  return template.content.firstChild;
}
function drawIcons(root) { root.querySelectorAll("[data-icon]").forEach(el => el.replaceChildren(icon(el.dataset.icon))); }
function el(tag,cls,text) { const node=document.createElement(tag); if(cls) node.className=cls; if(text!=null) node.textContent=text; return node; }
function link(cls,txt,hash) {const a=el("a",cls,txt);a.href="#"+hash;return a;}
function message(target,text) {target.textContent=text;target.hidden=!text;}
function errorText(e){return e instanceof TypeError ? "Sem conexão com a escola. Confira a internet e tente novamente." : e.message;}
drawIcons(document);
function setMode(mode) {
  const register=mode==="register";
  state.mode=mode;
  document.querySelectorAll("[data-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===mode)));
  $("#form-title").textContent=register?"Crie sua conta.":"Entre na escola.";
  $("#form-desc").textContent=register?"Escolha um usuário e uma senha para começar seu treino.":"Acesse sua conta para treinar aberturas e defesas.";
  $("#submit-text").textContent=register?"Criar minha conta":"Entrar na escola";
  $("#switch-label").textContent=register?"Já tem uma conta?":"Primeiro acesso?";
  $("#switch-mode").textContent=register?"Entre na escola":"Crie sua conta";
  $("#auth-form").action="/api/"+mode;
  $("#password").autocomplete=register?"new-password":"current-password";
  $("#password").minLength=register?12:1;
  message($("#auth-hint"),register?"Usuário de 3 a 32 caracteres, com letras sem acento, números, ponto, hífen ou sublinhado. Senha de 12 a 128 caracteres.":"");
  message($("#auth-error"),"");
}
document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$("#switch-mode").onclick=()=>{setMode(state.mode==="login"?"register":"login");$("#username").focus();};
function reveal(show) {
  $("#password").type=show?"text":"password";
  $("#eye").setAttribute("aria-label",show?"Ocultar senha":"Mostrar senha");
  $("#eye").setAttribute("aria-pressed",String(show));
  $("#eye").replaceChildren(icon(show?"eyeoff":"eye"));
}
$("#eye").onclick=()=>reveal($("#password").type==="password");
async function api(action, body, keepalive=false) {
  const response=await fetch("/api/"+action,{method:body?"POST":"GET",credentials:"same-origin",cache:"no-store",keepalive,...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({error:"O servidor não conseguiu responder. Tente novamente."}));
  if(!response.ok){const failure=new Error(data.error||"Tente novamente.");failure.status=response.status;throw failure;}
  return data;
}
const pendingSaves = new Set();
function cleanup(){
  if(state.dispose){
    const finish=state.dispose;state.dispose=null;
    const save=Promise.resolve(finish());pendingSaves.add(save);
    save.then(()=>pendingSaves.delete(save),()=>pendingSaves.delete(save));
  }
  return Promise.all([...pendingSaves]);
}
function showEntry(msg=""){
  cleanup().catch(()=>{});state.revision++;state.user=null;state.lessons=[];state.times={};state.filter={};
  school.replaceChildren();school.hidden=true;$("#entry").hidden=false;$("#entry-foot").hidden=false;
  const avatar=el("span","round-icon");avatar.append(icon("user"));$("#account").replaceChildren(avatar,el("span","","Área do aluno"));
  message($("#auth-error"),msg);document.title="Casa 64 · Escola de Xadrez";
}
function bigTitle(label,title,summary){
  const h=el("div","inner-heading");h.append(el("p","overline",label),el("h1","",title),el("p","",summary));return h;
}
const tiers={
  aberturas:[["As mais fortes e vitoriosas","39% a 43%"],["Sólidas e competitivas","36% a 39%"],["Agressivas ou arriscadas","33% a 36%"],["Irregulares e estatisticamente ruins","Abaixo de 32%"]],
  defesas:[["As mais vitoriosas e respeitadas","27% a 32%"],["Sólidas e jogáveis em alto nível","24% a 27%"],["Secundárias e armadilhas","20% a 24%"],["Duvidosas e estatisticamente fracas","Abaixo de 20%"]]
};
const labels={aberturas:"Aberturas",defesas:"Defesas"};
function back(label,hash){const a=link("crumb",null,hash);a.append(icon("back"),document.createTextNode(label));return a;}
function timeText(value=0){const s=Math.floor(value);return s>=3600?Math.floor(s/3600)+" h "+Math.floor(s%3600/60)+" min":s>=60?Math.floor(s/60)+" min "+s%60+" s":s+" s";}
function track(key){
  const white=key==="aberturas", a=link("track"+(white?" light":""),null,key);
  const art=el("span","track-art");art.setAttribute("aria-hidden","true");
  const outline= white ? '<path d="m40 10 9 12 8-4q12 20 12 49H26q2-12 15-28L28 50l-11-5 3-9 15-18zM25 72h46l4 9H21z"/><path d="m38 29 4-2"/>' : '<path d="M19 15h10v8h8v-8h13v8h8v-8h11v18l-8 8H27l-8-8zm11 27h29l4 25H26zm-5 26h39l7 11H19z"/>';
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 88 89");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.1");svg.innerHTML=outline;art.append(svg);
  a.append(art,el("p","overline",white?"Com as brancas":"Com as pretas"),el("h2","",labels[key]),el("span","track-action","Explorar 40 lições"));return a;
}
function drawHome(){
  school.replaceChildren(bigTitle("Área do aluno","Seu repertório.","Escolha um lado do tabuleiro para começar a treinar."));
  const tracks=el("div","tracks");tracks.append(track("defesas"),track("aberturas"));
  const fund=el("div","fund");fund.append(icon("book"),el("strong","","Fundamentos"),el("small","","Em breve"));school.append(tracks,fund);
  document.title="Seu repertório · Casa 64";
}
const fold=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function drawLibrary(key){
  const filters=state.filter[key] ||= {term:"",tier:0};
  school.replaceChildren(back("Seu repertório","inicio"),bigTitle(key==="aberturas"?"Repertório das brancas":"Repertório das pretas",labels[key]+".","Escolha uma das 40 lições para praticar no tabuleiro."));
  const bar=el("div","library-bar"), search=el("label","search"), input=el("input");
  input.type="search";input.placeholder=key==="aberturas"?"Buscar abertura":"Buscar defesa";input.setAttribute("aria-label",input.placeholder);input.value=filters.term;
  search.append(icon("search"),input);
  const filter=el("label","filter"), select=el("select");select.setAttribute("aria-label","Filtrar por tier");
  ["Todos os tiers","Tier 1","Tier 2","Tier 3","Tier 4"].forEach((txt,i)=>{const o=el("option","",txt);o.value=i;select.append(o);});select.value=filters.tier;
  filter.append(select);bar.append(search,filter);
  const results=el("div"), note=el("p","library-note","As faixas de vitória são estimativas do repertório fornecido. O resultado de uma partida depende também do nível dos jogadores e do ritmo de jogo.");
  school.append(bar,results,note);
  function fill(){
    results.replaceChildren();
    const matched=state.lessons.filter(l=>l.category===key&&(!filters.tier||l.tier===filters.tier)&&fold(l.name+" "+l.notation).includes(fold(filters.term.trim()))).sort((a,b)=>a.rank-b.rank);
    for(const [i,[name,range]] of tiers[key].entries()){
      const group=matched.filter(l=>l.tier===i+1);if(!group.length)continue;
      const head=el("div","tier-head");head.append(el("span","tier-tag","Tier "+(i+1)),el("h2","",name),el("span","tier-range",range+" de vitória"));
      const list=el("div","lesson-list");
      for(const l of group){const row=link("lesson-row",null,key+"/"+l.id);const title=el("span");title.append(el("span","lesson-name",l.name),el("span","notation",l.notation));const t=el("span","time");t.dataset.timeId=l.id;t.append(icon("clock"),el("span","",timeText(state.times[l.id])));t.setAttribute("aria-label","Tempo de treino: "+timeText(state.times[l.id]));row.append(el("span","rank",String(l.rank).padStart(2,"0")),title,t,icon("next"));list.append(row);}
      results.append(head,list);
    }
    if(!matched.length) results.append(el("p","empty","Nenhuma lição encontrada. Tente outro nome ou tier."));
  }
  input.oninput=()=>{filters.term=input.value;fill();};select.onchange=()=>{filters.tier=Number(select.value);fill();};fill();
  document.title=labels[key]+" · Casa 64";
}
async function renderRoute(){
  const rev=++state.revision;
  const priorSave=cleanup();
  priorSave.catch(()=>{if(state.user && rev===state.revision){const note=el("p","error","Não foi possível confirmar a gravação do último intervalo de treino.");school.prepend(note);}});
  if(!state.user)return;
  const [cat,id]=location.hash.slice(1).split("/");
  if(!Object.hasOwn(labels,cat))drawHome();
  else if(!id)drawLibrary(cat);
  else {
    const lesson=state.lessons.find(l=>l.id===id&&l.category===cat);
    if(!lesson){drawLibrary(cat);return;}
    const owner=state.user;school.replaceChildren();document.title=lesson.name+" · Casa 64";
    try{
      const {mountTrainer}=await import("/treinador.js");if(rev!==state.revision)return;
      state.dispose=mountTrainer(school,lesson,{initialSeconds:state.times[id]||0,onExit:()=>{location.hash=cat;},onTime:async(seconds,eventId)=>{
        if(state.user!==owner)return;
        let result;
        try{result=await api("progress",{username:owner,lessonId:id,seconds,eventId},true);}
        catch(e){
          if((e.status===401||e.status===409)&&state.user===owner)showEntry("A sessão mudou. Entre novamente para continuar seu treino.");
          throw e;
        }
        if(state.user!==owner)return;
        state.times[id]=Math.max(state.times[id]||0,result.seconds);
        const t=document.querySelector('[data-time-id="'+id+'"]');if(t){t.lastChild.textContent=timeText(state.times[id]);t.setAttribute("aria-label","Tempo de treino: "+timeText(state.times[id]));}
      }});
    }catch(e){if(rev===state.revision)school.replaceChildren(back("Voltar ao catálogo",cat),el("p","error","Não foi possível iniciar o treinador. Atualize a página para tentar novamente."));}
  }
  window.scrollTo(0,0);$("#main").focus({preventScroll:true});
}
async function enter(session){
  const {lessons}=await api("lessons");state.user=session.user;state.times=session.times||{};state.lessons=lessons;
  const u=el("span","",state.user), leave=el("button","text-button","Sair");
  leave.onclick=async()=>{
    leave.disabled=true;
    let saved=true;
    try{await cleanup();}catch{saved=false;}
    if(!state.user)return;
    try{
      await api("logout",{});setMode("login");showEntry(saved?"":"Você saiu. Não foi possível confirmar o último intervalo de treino.");
      history.replaceState(null,"",location.pathname);
    }catch(e){leave.disabled=false;await renderRoute();school.prepend(el("p","error",errorText(e)));}
  };
  const avatar=el("span","round-icon");avatar.append(icon("user"));$("#account").replaceChildren(avatar,u,leave);
  $("#entry").hidden=true;$("#entry-foot").hidden=true;school.hidden=false;$("#auth-form").reset();reveal(false);
  await renderRoute();
}
let submitted=false;
$("#auth-form").onsubmit=async(event)=>{
  event.preventDefault();if(submitted)return;submitted=true;const button=$("#submit");button.disabled=true;message($("#auth-error"),"");
  try{const session=await api(state.mode,{username:$("#username").value.trim(),password:$("#password").value});$("#password").value="";await enter(session);}
  catch(e){message($("#auth-error"),errorText(e));}
  finally{button.disabled=false;submitted=false;}
};
window.addEventListener("hashchange",renderRoute);
window.addEventListener("pageshow",event=>{if(event.persisted)location.reload();});
async function initialize(){
  submitted=true;$("#submit").disabled=true;
  try{const session=await api("session");if(session.user)await enter(session);}
  catch(e){message($("#auth-error"),errorText(e));}
  finally{submitted=false;$("#submit").disabled=false;}
}
initialize();

