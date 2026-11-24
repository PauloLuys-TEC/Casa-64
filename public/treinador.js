const files = "abcdefgh";
const startingRows = ["RNBQKBNR", "PPPPPPPP", "", "", "", "", "pppppppp", "rnbqkbnr"];
const pieceNames = { p: "peão", n: "cavalo", b: "bispo", r: "torre", q: "dama", k: "rei" };
const initials = { p: "", n: "C", b: "B", r: "T", q: "D", k: "R" };
const svgNamespace = "http://www.w3.org/2000/svg";

function squareAt(x, y) {
  return x >= 0 && x < 8 && y >= 0 && y < 8 ? files[x] + (y + 1) : "";
}

function coordinates(square) {
  return [files.indexOf(square[0]), Number(square[1]) - 1];
}

function isWhite(piece) {
  return piece.toUpperCase() === piece;
}

function startingPosition() {
  const board = {};
  startingRows.forEach((row, y) => [...row].forEach((piece, x) => { board[squareAt(x, y)] = piece; }));
  return { board, enPassant: "", castle: "KQkq" };
}

function attacks(board, from, to) {
  if (from === to || !board[from]) return false;
  const [x, y] = coordinates(from);
  const [u, v] = coordinates(to);
  const dx = u - x, dy = v - y, ax = Math.abs(dx), ay = Math.abs(dy);
  const type = board[from].toLowerCase();
  if (type === "p") return ax === 1 && dy === (isWhite(board[from]) ? 1 : -1);
  if (type === "n") return ax * ay === 2;
  if (type === "k") return Math.max(ax, ay) === 1;
  const diagonal = ax === ay, straight = dx === 0 || dy === 0;
  if (type === "b" && !diagonal || type === "r" && !straight || type === "q" && !diagonal && !straight) return false;
  for (let i = 1; i < Math.max(ax, ay); i++) {
    if (board[squareAt(x + i * Math.sign(dx), y + i * Math.sign(dy))]) return false;
  }
  return true;
}

function underAttack(board, square, byWhite) {
  return Object.entries(board).some(([from, piece]) => isWhite(piece) === byWhite && attacks(board, from, square));
}

function kingInCheck(board, white) {
  const king = Object.keys(board).find(sq => board[sq] === (white ? "K" : "k"));
  return !king || underAttack(board, king, !white);
}

function movePosition(position, from, to, promotion = "q") {
  const board = { ...position.board }, piece = board[from], target = board[to];
  const [x,y] = coordinates(from), [u,v] = coordinates(to);
  const type = piece.toLowerCase(), white = isWhite(piece);
  let castle = position.castle;
  const rookRights = { a1: "Q", h1: "K", a8: "q", h8: "k" };
  if (type === "k") castle = castle.replace(white ? /[KQ]/g : /[kq]/g, "");
  if (rookRights[from]) castle = castle.replace(rookRights[from], "");
  if (rookRights[to]) castle = castle.replace(rookRights[to], "");
  if (type === "p" && to === position.enPassant && x !== u && !target) delete board[squareAt(u,y)];
  if (type === "k" && Math.abs(u-x) === 2) {
    const rookFrom = squareAt(u > x ? 7 : 0, y);
    board[squareAt(u > x ? 5 : 3, y)] = board[rookFrom];
    delete board[rookFrom];
  }
  delete board[from];
  board[to] = type === "p" && (v === 0 || v === 7) ? (white ? promotion.toUpperCase() : promotion.toLowerCase()) : piece;
  return { board, castle, enPassant: type === "p" && Math.abs(v-y) === 2 ? squareAt(x, (v+y)/2) : "" };
}

function legal(position, from, to, white) {
  const {board} = position, piece = board[from];
  if (!piece || isWhite(piece) !== white || from === to || !/^[a-h][1-8]$/.test(to)) return false;
  if (board[to] && (isWhite(board[to]) === white || board[to].toLowerCase() === "k")) return false;
  const [x,y] = coordinates(from), [u,v] = coordinates(to), type = piece.toLowerCase();
  if (type === "p") {
    const dir = white ? 1 : -1;
    if (x === u) {
      if (board[to]) return false;
      if (v-y !== dir && !(y === (white ? 1 : 6) && v-y === 2*dir && !board[squareAt(x,y+dir)])) return false;
    } else if (!attacks(board, from, to) || (!board[to] && position.enPassant !== to)) return false;
  } else if (type === "k" && y === v && Math.abs(u-x) === 2) {
    const side = u > x ? "K" : "Q", right = white ? side : side.toLowerCase();
    if (!position.castle.includes(right) || from !== (white ? "e1" : "e8")) return false;
    const rookFrom = squareAt(u > x ? 7 : 0, y), transit = squareAt((u+x)/2,y);
    if (board[rookFrom] !== (white ? "R" : "r") || board[transit] || board[to] || (u < x && board[squareAt(1,y)])) return false;
    if (kingInCheck(board,white) || kingInCheck(movePosition(position, from, transit).board, white)) return false;
  } else if (!attacks(board, from, to)) return false;
  return !kingInCheck(movePosition(position, from, to).board, white);
}

function hasLegalMove(position, white) {
  return Object.keys(position.board).some(from => isWhite(position.board[from]) === white &&
    [...files].some(file => [1,2,3,4,5,6,7,8].some(rank => legal(position,from,file+rank,white))));
}

function notation(position, next, move) {
  const {from,to} = move, piece = position.board[from], type = piece.toLowerCase(), white = isWhite(piece);
  const [x] = coordinates(from), [u,v] = coordinates(to);
  const capture = Boolean(position.board[to]) || type === "p" && x !== u;
  let san;
  if (type === "k" && Math.abs(u-x) === 2) san = u > x ? "O-O" : "O-O-O";
  else {
    const alternatives = Object.keys(position.board).filter(sq => sq !== from && position.board[sq] === piece && legal(position,sq,to,white));
    let origin = "";
    if (type === "p" && capture) origin = from[0];
    else if (alternatives.length) origin = !alternatives.some(sq => sq[0] === from[0]) ? from[0] : !alternatives.some(sq => sq[1] === from[1]) ? from[1] : from;
    san = initials[type] + origin + (capture ? "x" : "") + to;
    if (type === "p" && (v === 0 || v === 7)) san += "=" + initials[(move.promotion || "q").toLowerCase()];
  }
  if (kingInCheck(next.board,!white)) san += hasLegalMove(next,!white) ? "+" : "#";
  return san;
}

function prepareLine(moves) {
  const positions = [startingPosition()], labels = [];
  moves.forEach((move, i) => {
    const before = positions[i];
    if (!legal(before, move.from, move.to, i % 2 === 0)) throw new Error("Lance inválido na lição: " + (i+1) + " " + move.from + "–" + move.to);
    const after = movePosition(before,move.from,move.to,move.promotion);
    labels.push(notation(before,after,move));
    positions.push(after);
  });
  return { positions, labels };
}

// Original vector silhouettes share a base and remain readable on either square color.
const shapes = {
  p: ["M22 22a8 8 0 1 1 4 0c-1 4 0 8 2 11l4 5H16l4-5c2-3 3-7 2-11Z"],
  r: ["M11 8h6v6h4V8h6v6h4V8h6v12l-5 4 1 13H15l1-13-5-4Z", "M16 22h16"],
  b: ["M15 33c5-4 3-6 1-9-3-5 0-10 7-16l1-4 2 4c7 6 10 11 7 16-2 3-4 5 0 9l1 4H14Z","M24 12l3 6-4 5","M17 30h14"],
  n: ["M13 37c1-5 6-9 9-13l3-7-7 6-5 1-5-5 9-10 5-2 2-6 4 5 3-3 1 6c7 6 8 15 5 28Z","M14 18l2-1","M20 12h1","M29 10c4 5 5 10 4 15"],
  q: ["M10 12l8 8 6-11 6 11 8-8-5 19H15Z","M15 31h18l2 6H13Z"], 
  k: ["M22 4h4v5h5v4h-5v4h-4v-4h-5V9h5Z","M17 17c-6-4-11 2-8 8l5 7h20l5-7c3-6-2-12-8-8l-7 5Z","M16 32h16l2 5H14Z"]
};

function svgElement(tag, attrs) {
  const node = document.createElementNS(svgNamespace,tag);
  Object.entries(attrs).forEach(([key,value]) => node.setAttribute(key,value));
  return node;
}

function pieceImage(piece) {
  const type = piece.toLowerCase(), white = isWhite(piece);
  const svg = svgElement("svg",{viewBox:"0 0 48 48","aria-hidden":"true",focusable:"false",class:"ct-piece " + (white ? "ct-white" : "ct-black")});
  const group = svgElement("g",{fill:"var(--piece-fill)",stroke:"var(--piece-stroke)","stroke-width":"1.6","stroke-linecap":"round","stroke-linejoin":"round"});
  shapes[type].forEach(d => group.append(svgElement("path",{d})));
  if (type === "q") [[10,11],[24,8],[38,11]].forEach(([cx,cy])=>group.append(svgElement("circle",{cx,cy,r:2.8})));
  group.append(svgElement("path",{d:"M15 36h18l3 4v3H12v-3Z"}));
  svg.append(group);
  return svg;
}

const icons = {
  back:"m14 5-7 7 7 7", hint:"M9 17h6m-5 3h4M8.2 13.7a6 6 0 1 1 7.6 0c-1.2.9-1.8 1.8-1.8 3.3h-4c0-1.5-.6-2.4-1.8-3.3Z",
  repeat:"M4 5v5h5M4.4 10a8 8 0 1 1 .4 6", play:"m8 5 10 7-10 7Z", board:"M4 4h16v16H4Zm0 8h16m-8-8v16",
  clock:"M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-5v5l3 2",
  flip:"M4 8h14l-3-3m5 11H6l3 3", next:"m9 5 7 7-7 7", check:"m4 12 5 5L20 6"
};
function icon(name) {
  const svg=svgElement("svg",{viewBox:"0 0 24 24",width:18,height:18,fill:"none",stroke:"currentColor","stroke-width":"1.7","stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":"true",focusable:"false"});
  svg.append(svgElement("path",{d:icons[name]})); return svg;
}
function node(tag,cls,text) {
  const el=document.createElement(tag); if(cls) el.className=cls; if(text !== undefined) el.textContent=text; return el;
}
function button(label,cls,callback,iconName) {
  const el=node("button",cls); el.type="button";
  if(iconName) el.append(icon(iconName)); el.append(document.createTextNode(label)); el.addEventListener("click",callback); return el;
}
function timeText(seconds) {
  const hours=Math.floor(seconds/3600), minutes=Math.floor(seconds/60)%60, secs=seconds%60;
  return hours ? hours+"h "+minutes+"min" : minutes+"min "+String(secs).padStart(2,"0")+"s";
}

function trackTime(root, initialSeconds, onTime, display, sync) {
  const start = Number(initialSeconds) || 0;
  let last=performance.now(), activeUntil=0, accrued=0, queued=0, saved=0, current=null;
  let inFlight=null, finished=null, disposed=false;
  function account() {
    const now=performance.now();
    if (!document.hidden) accrued+=Math.max(0,Math.min(now,activeUntil)-last)/1000;
    last=now;
    const whole=Math.floor(accrued);
    queued+=whole; accrued-=whole;
    display.textContent=timeText(start+saved+queued);
  }
  function activity() { account(); activeUntil=performance.now()+60000; }
  function flush() {
    if (!disposed) account();
    if (inFlight) return inFlight;
    if (queued < 1 || typeof onTime !== "function") return Promise.resolve();
    async function saveQueue() {
      try {
        while (queued > 0) {
          current ||= {seconds:Math.min(30,queued),id:crypto.randomUUID()};
          await onTime(current.seconds,current.id);
          saved+=current.seconds; queued-=current.seconds; current=null;
        }
        sync.hidden=true;
      } catch (error) {
        if (!disposed) { sync.textContent="Tempo pendente de sincronização."; sync.hidden=false; }
        throw error;
      }
    }
    inFlight=saveQueue().finally(()=>{inFlight=null;});
    return inFlight;
  }
  function backgroundFlush() { void flush().catch(()=>{}); }
  function visibility() {
    // visibilitychange fires after the flag changed. Close the eligible segment explicitly.
    if (document.hidden) {
      const now=performance.now(); accrued+=Math.max(0,Math.min(now,activeUntil)-last)/1000; last=now;
      activeUntil=0; backgroundFlush();
    } else { last=performance.now(); activeUntil=0; }
  }
  function pageHide() { backgroundFlush(); }
  const events=["pointerdown","keydown","wheel"];
  events.forEach(evt=>root.addEventListener(evt,activity,{passive:true}));
  document.addEventListener("visibilitychange",visibility);
  window.addEventListener("pagehide",pageHide);
  display.textContent=timeText(start);
  const tick=setInterval(account,1000), send=setInterval(backgroundFlush,12000);
  return () => {
    if (finished) return finished;
    account(); disposed=true; clearInterval(tick); clearInterval(send);
    events.forEach(evt=>root.removeEventListener(evt,activity));
    document.removeEventListener("visibilitychange",visibility);
    window.removeEventListener("pagehide",pageHide);
    finished=flush();
    // Navigation may only allow a best-effort flush. Callers that await it still receive errors.
    void finished.catch(()=>{});
    return finished;
  };
}

export function mountTrainer(container, lesson, { onExit, onTime, initialSeconds=0 }) {
  const {positions,labels}=prepareLine(lesson.moves);
  const learnerWhite=lesson.category==="aberturas", color=learnerWhite?"brancas":"pretas", total=labels.length;
  const category=learnerWhite?"Aberturas":"Defesas";
  let ply=0, mode="guided", flipped=!learnerWhite, selected="", hint=0, feedback="", mistake=false, waiting=null, disposed=false, focusSquare=learnerWhite?"e2":"e7";
  const root=node("section","ct-trainer");
  const trail=node("div","ct-trail");
  const exit=button("Voltar para "+category.toLowerCase(),"ct-link",()=>{dispose();onExit();},"back");
  const clock=node("span","ct-clock"), time=node("span"); clock.append(icon("clock"),time);
  trail.append(exit,clock);
  const title=node("h1","ct-title",lesson.name);
  const intro=node("p","ct-intro",lesson.summary);
  const layout=node("div","ct-layout"), stage=node("div","ct-stage");
  const stageTop=node("div","ct-stage-top"), side=node("span","ct-side","Você joga com as "+color);
  const flip=button("Girar tabuleiro","ct-link",()=>{flipped=!flipped;drawBoard();},"flip");
  stageTop.append(side,flip);
  const board=node("div","ct-board"); board.setAttribute("role","group"); board.setAttribute("aria-label","Tabuleiro de xadrez. Use as setas para navegar e Enter ou espaço para selecionar.");
  const cells=Array.from({length:64},(_,index)=>{
    const cell=node("button","ct-square"); cell.type="button"; cell.tabIndex=-1;
    cell.addEventListener("click",()=>selectSquare(cell.dataset.square));
    cell.addEventListener("keydown",event=>{
      let next=index;
      switch(event.key) {
        case "ArrowRight": if(index%8<7) next++; break;
        case "ArrowLeft": if(index%8>0) next--; break;
        case "ArrowDown": if(index<56) next+=8; break;
        case "ArrowUp": if(index>=8) next-=8; break;
        case "Home": next=index-index%8; break;
        case "End": next=index-index%8+7; break;
        case "Escape": selected=""; drawBoard(); break;
        default:return;
      }
      event.preventDefault();
      if(next!==index){focusSquare=cells[next].dataset.square; cells.forEach(c=>c.tabIndex=c.dataset.square===focusSquare?0:-1);cells[next].focus();}
    });
    board.append(cell);return cell;
  });
  const modes=node("div","ct-modes");
  const guided=button("Praticar","ct-mode",()=>reset("guided"),"board"), demonstration=button("Ver demonstração","ct-mode",()=>reset("demo"),"play");
  modes.append(guided,demonstration);
  stage.append(stageTop,board,modes);
  const coach=node("aside","ct-coach"), coachHead=node("div","ct-coach-head"), headIcon=node("div","ct-coach-icon");
  headIcon.append(pieceImage("N")); coachHead.append(headIcon,node("h2","ct-coach-name","Treinador"));
  const body=node("div","ct-coach-body"), step=node("p","ct-step"), bar=node("progress","ct-progress"); bar.max=total; bar.setAttribute("aria-label","Progresso da linha");
  const instruction=node("h3","ct-instruction"), live=node("div","ct-live");
  live.setAttribute("aria-live","polite"); live.setAttribute("aria-atomic","true");
  const message=node("p","ct-message"), extra=node("p","ct-extra"), buttons=node("div","ct-actions");
  live.append(instruction,message,extra); body.append(step,bar,live,buttons);
  const goal=node("div","ct-goal"); goal.append(node("h3","","Plano da posição"),node("p","",lesson.goal || lesson.summary));
  coach.append(coachHead,body,goal);
  layout.append(stage,coach);
  const record=node("section","ct-record"), recordTitle=node("h2","","Lances da sessão"), notationArea=node("div","ct-history"), annotations=node("p","ct-annotation");
  record.append(recordTitle,notationArea,annotations);
  const sync=node("p","ct-sync"); sync.hidden=true;
  root.append(trail,title,intro,layout,record,sync); container.replaceChildren(root);
  const stopTimer=trackTime(root,initialSeconds,onTime,time,sync);
  function dispose() {
    disposed=true; clearTimeout(waiting);
    return stopTimer();
  }
  function moveNumber(i) {return (Math.floor(i/2)+1)+(i%2?"... ":". ")+labels[i];}
  function turnIsLearner() {return (ply%2===0)===learnerWhite;}
  function drawBoard() {
    const last=lesson.moves[ply-1], expected=lesson.moves[ply], current=positions[ply].board;
    cells.forEach((cell,i)=>{
      const col=i%8, row=Math.floor(i/8), x=flipped?7-col:col, y=flipped?row:7-row;
      const sq=squareAt(x,y), piece=current[sq], activeHint=mode!=="demo" && turnIsLearner() && expected;
      cell.dataset.square=sq; cell.className="ct-square "+((x+y)%2?"ct-light":"ct-dark");
      if (last && (sq===last.from || sq===last.to)) cell.classList.add("ct-last");
      if (sq===selected) cell.classList.add("ct-selected");
      if (activeHint && (hint>=1 && sq===expected.from || hint===2 && sq===expected.to)) cell.classList.add("ct-hint");
      cell.ariaLabel=sq + (piece?", "+pieceNames[piece.toLowerCase()]+" "+(isWhite(piece)?"das brancas":"das pretas"):", vazia");
      cell.setAttribute("aria-pressed",String(sq===selected)); cell.tabIndex=sq===focusSquare?0:-1;
      cell.replaceChildren();
      if (piece) cell.append(pieceImage(piece));
      if (col===0) cell.append(node("span","ct-rank",String(y+1)));
      if (row===7) cell.append(node("span","ct-file",files[x]));
    });
  }
  function recordMoves() {
    notationArea.replaceChildren();
    if (!ply) {notationArea.append(node("span","ct-empty","Os lances aparecem aqui durante o treino."));annotations.textContent="";return;}
    for (let i=0;i<ply;i++) {
      const item=button(moveNumber(i),"ct-ply",()=>{
        annotations.textContent=moveNumber(i)+" · "+lesson.moves[i].note;
        notationArea.querySelectorAll("button").forEach(el=>el.classList.remove("ct-current")); item.classList.add("ct-current");
      });
      if (i===ply-1) item.classList.add("ct-current");
      notationArea.append(item);
    }
    annotations.textContent=moveNumber(ply-1)+" · "+lesson.moves[ply-1].note;
  }
  function addAction(label,fn,iconName,primary=false) {
    buttons.append(button(label,primary?"ct-action ct-primary":"ct-action",fn,iconName));
  }
  function updatePanel() {
    const done=ply===total, demo=mode==="demo", example=ply>=lesson.mainPlies && lesson.mainPlies<total;
    [guided,demonstration].forEach((el,i)=>el.setAttribute("aria-pressed",String(i===0?!demo:demo)));
    step.textContent=(example?(lesson.mainPlies===0?"Exemplo do sistema":"Continuação ilustrativa"):demo?"Demonstração":mode==="recall"?"Prática de memória":"Prática guiada")+" · "+ply+" de "+total+" lances individuais";
    bar.value=ply; message.classList.toggle("ct-error",mistake);buttons.replaceChildren();extra.textContent="";
    if (demo) {
      instruction.textContent=ply===0?"Observe o primeiro lance":moveNumber(ply-1);
      message.textContent=ply===0?lesson.goal:lesson.moves[ply-1].note;
      if (ply>0) addAction("Anterior",()=>showPly(ply-1),"back");
      if (!done) addAction("Próximo lance",()=>showPly(ply+1),"play",true);
      else addAction("Praticar de memória",()=>reset("recall"),"repeat",true);
    } else if (done) {
      instruction.textContent="Linha concluída";
      message.textContent="Você completou a sequência com as "+color+".";
      extra.textContent=lesson.tip;
      addAction("Repetir de memória",()=>reset("recall"),"repeat",true);
      addAction("Voltar ao catálogo",()=>{dispose();onExit();},"back");
    } else if (!turnIsLearner()) {
      instruction.textContent="Resposta das "+(learnerWhite?"pretas":"brancas");
      message.textContent=ply?lesson.moves[ply-1].note:"Observe como as brancas começam a partida.";
    } else {
      const next=lesson.moves[ply], piece=pieceNames[positions[ply].board[next.from].toLowerCase()];
      instruction.textContent="Sua vez com as "+color;
      if (feedback) message.textContent=feedback;
      else if (hint===2) message.textContent="Jogue "+labels[ply]+". Selecione "+next.from+" e depois "+next.to+".";
      else if (hint===1) message.textContent="Comece pela peça em "+next.from+". Procure a casa de destino.";
      else if (mode==="recall") message.textContent=selected?"Escolha a casa de destino.":"Repita a linha de memória. Selecione a peça que deve jogar.";
      else message.textContent=selected?"Jogue "+labels[ply]+". Agora selecione a casa de destino.":"Jogue "+labels[ply]+". Selecione primeiro a peça e depois a casa de destino.";
      if (!feedback && mode==="guided" && hint===0) extra.textContent=next.note;
      if (hint===2 && mode==="recall") extra.textContent="Peça do lance: "+piece+".";
      if (hint<2) addAction(hint===0?"Pedir dica":"Mostrar destino",()=>{hint++;feedback="";mistake=false;drawBoard();updatePanel();},"hint");
      addAction("Recomeçar",()=>reset(mode),"repeat");
    }
    extra.hidden=!extra.textContent;
  }
  function render() {drawBoard(); updatePanel(); recordMoves();}
  function showPly(i) {
    ply=i; selected=""; hint=0; feedback=""; mistake=false;render();
  }
  function scheduleReply() {
    clearTimeout(waiting);
    if (mode!=="demo" && ply<total && !turnIsLearner()) {
      waiting=setTimeout(()=>{if(!disposed) showPly(ply+1);},ply===0?650:1150);
    }
  }
  function reset(toMode) {
    clearTimeout(waiting); mode=toMode; showPly(0);scheduleReply();
  }
  function selectSquare(sq) {
    if (disposed || mode==="demo" || ply>=total || !turnIsLearner()) return;
    focusSquare=sq;
    const position=positions[ply], expected=lesson.moves[ply], piece=position.board[sq];
    feedback=""; mistake=false;
    if (sq===selected) selected="";
    else if (piece && isWhite(piece)===learnerWhite) selected=sq;
    else if (selected) {
      if (selected===expected.from && sq===expected.to) {showPly(ply+1);scheduleReply();return;}
      mistake=true;
      feedback=legal(position,selected,sq,learnerWhite)?"Esse lance é legal. Para praticar a linha escolhida, tente outra vez.":"Essa peça não pode ir para "+sq+" nesta posição. Escolha outra casa.";
      selected="";
    } else {feedback="Selecione primeiro uma peça das "+color+".";mistake=true;}
    drawBoard();updatePanel();
  }
  render();scheduleReply();
  return dispose;
}
