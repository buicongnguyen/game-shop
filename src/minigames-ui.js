import * as S from './sidequests.js';
import { esc } from './ui.js';

// Optional games use the same dialog and save as management, without running the shop clock.
function session(context, rootId, onLeave) {
  const { dialog, persist, render } = context;
  let timer = null, disposed = false;
  function cleanup() { if (disposed) return; disposed = true; clearInterval(timer); onLeave?.(); persist(); render(); dialog.removeEventListener('close',cleanup); }
  dialog.addEventListener('close',cleanup,{once:true});
  return { start(callback, interval = 40) { clearInterval(timer); let previous=performance.now(); timer=setInterval(()=>{const now=performance.now(),delta=Math.min(.2,(now-previous)/1000);previous=now;if(!dialog.open||!dialog.querySelector(`#${rootId}`)){cleanup();return;}if(!document.hidden)callback(delta);},interval); }, stop(){clearInterval(timer);timer=null;}, cleanup };
}

export function showBargaining(context) {
  const {game,dialog,openModal,persist,render,toast}=context;
  const result=S.beginBargaining(game);if(!result.ok){toast(result.message);return;}
  persist();
  openModal('Trả giá ở chợ', '<div id="market-game"></div>', '<button class="secondary" data-action="close-modal">Chốt giá & về tiệm</button>');
  const run=session(context,'market-game',()=>S.finishBargaining(game));let phase=0,position=0,round;
  function paintRound() {
    round=S.bargainingRound(game);phase=0;position=0;
    if(!round){run.stop();dialog.querySelector('#market-game').innerHTML=`<div class="mini-result">🧺<h3>Giảm ${Math.round(S.marketDiscount(game)*100)}% hôm nay!</h3></div><p>Ưu đãi áp dụng cho nguyên liệu nhập thường và nhập gấp của hôm nay.</p>`;persist();render();return;}
    dialog.querySelector('#market-game').innerHTML=`<p>Lượt ${round.index+1}/3 · Dừng kim ở vùng xanh +5%, vàng +2%. Tối đa giảm 15% trong ngày.</p><div class="bargain-gauge" aria-label="Vùng trả giá"><span class="bargain-yellow" style="left:${round.yellowStart*100}%;width:${(round.yellowEnd-round.yellowStart)*100}%"></span><span class="bargain-green" style="left:${round.greenStart*100}%;width:${(round.greenEnd-round.greenStart)*100}%"></span><i id="market-needle"></i></div><button class="primary" id="market-stop">Chốt!</button><p id="market-result">Đã giảm ${Math.round(S.marketDiscount(game)*100)}%</p>`;
    dialog.querySelector('#market-stop').onclick=()=>{run.stop();const result=S.stopBargaining(game,position);persist();soundFeedback(result);dialog.querySelector('#market-result').textContent=`${result.award?`Tốt lắm! +${Math.round(result.award*100)}%`:'Hụt rồi!'} · Tổng giảm ${Math.round(result.discount*100)}%`;const next=dialog.querySelector('#market-stop');next.textContent=result.done?'Xem giá đã chốt':'Lượt tiếp →';next.onclick=paintRound;};
    dialog.querySelector('#market-stop').focus({preventScroll:true});
    run.start(delta=>{phase=(phase+delta*round.speed)%2;position=phase<=1?phase:2-phase;const needle=dialog.querySelector('#market-needle');if(needle)needle.style.left=`${position*100}%`;});
  }
  function soundFeedback(result){toast(result.award?'Bác bán hàng đồng ý bớt giá!':'Thử khéo hơn ở lượt sau nhé.');}
  paintRound();
}

export function showSecretBroth(context) {
  const {game,dialog,openModal,persist,render,toast}=context;
  if(game.day<3){toast('Công thức bí truyền mở từ ngày 3.');return;}
  const existing=game.sidequests?.secret?.day===game.day?game.sidequests.secret:null;
  if(existing?.success){toast('Nước dùng bí truyền đã sẵn sàng cho hôm nay.');return;}
  if(existing?.attempts>=2){toast('Đã hết hai lượt thử hôm nay.');return;}
  openModal('Nồi nước dùng bí truyền',`<div id="secret-game"><p>Nhớ thứ tự gia vị rồi nêm lại. Bạn có 2 lượt thử mỗi ngày, với cùng một loại nước dùng.</p><p>Công thức đúng: +1 sao và +2.000đ mỗi tô phù hợp phục vụ tại quán hôm nay.</p><div class="secret-broths">${context.ingredients.filter(item=>item.kind==='broth'&&game.unlocked.includes(item.id)&&(!existing||existing.broth===item.id)).map(item=>`<button class="secondary" data-broth-choice="${item.id}"><img src="./assets/ingredients/${item.id}.svg" alt="">${esc(item.shortName)}</button>`).join('')}</div></div>`);
  const run=session(context,'secret-game',()=>S.abandonSecretBroth(game));let sequence=[],watching=false,shown=-1,elapsed=0;
  for(const button of dialog.querySelectorAll('[data-broth-choice]'))button.onclick=()=>{const result=S.startSecretBroth(game,button.dataset.brothChoice);if(!result.ok){toast(result.message);return;}sequence=result.sequence;persist();watching=true;elapsed=0;shown=-1;dialog.querySelector('#secret-game').innerHTML=`<p id="secret-instruction">Nhìn kỹ thứ tự gia vị · Lượt ${result.attempt}/2</p><div id="secret-display" class="secret-display">👀</div><div id="secret-progress" class="secret-progress">${sequence.map(()=>'<i></i>').join('')}</div><div class="spice-choices">${S.SPICES.map(spice=>`<button class="secondary" data-spice-choice="${spice.id}" disabled><span>${spice.icon}</span>${esc(spice.name)}</button>`).join('')}</div>`;
    for(const choice of dialog.querySelectorAll('[data-spice-choice]'))choice.onclick=()=>{if(watching)return;const answer=S.submitSpice(game,choice.dataset.spiceChoice);persist();const spice=S.SPICES.find(row=>row.id===choice.dataset.spiceChoice);dialog.querySelector('#secret-display').textContent=spice.icon;for(const [index,dot]of [...dialog.querySelectorAll('#secret-progress i')].entries())dot.classList.toggle('filled',index<answer.index);if(answer.done){run.stop();dialog.querySelector('#secret-instruction').textContent=answer.success?'Đúng công thức rồi! Tiệm có món đặc biệt hôm nay.':'Chưa đúng thứ tự. Công thức vẫn còn bí mật!';dialog.querySelector('#secret-display').textContent=answer.success?'✨🍲':'💨';dialog.querySelectorAll('[data-spice-choice]').forEach(node=>node.disabled=true);render();}};
    run.start(delta=>{elapsed+=delta;const index=Math.floor(elapsed/.82)-1;if(index===shown)return;shown=index;const display=dialog.querySelector('#secret-display');if(index<0)return;if(index>=sequence.length){watching=false;run.stop();display.textContent='?';dialog.querySelector('#secret-instruction').textContent='Đến lượt bạn! Nêm đúng thứ tự vừa xem.';dialog.querySelectorAll('[data-spice-choice]').forEach(node=>node.disabled=false);return;}const spice=S.SPICES.find(row=>row.id===sequence[index]);display.innerHTML=`<span>${spice.icon}</span><small>${esc(spice.name)}</small>`;});
  };
}

export function showWashing(context) {
  const {game,dialog,openModal,persist,render,toast}=context;
  const result=S.startWashing(game);if(!result.ok){toast(result.message);return;}persist();
  openModal('Rửa tô cuối ngày','<div id="washing-game"><p>Chà trên tô bằng chuột hoặc chạm, hay nhấn Space. Rửa càng sạch, mai càng bớt tiền mua tô!</p><button id="scrub-bowl" class="scrub-bowl" aria-label="Chà rửa tô">🥣<span class="wash-bubbles">🫧</span></button><progress id="wash-progress" value="0" max="8"></progress><p id="wash-status"></p></div>','<button class="secondary" data-action="close-modal">Cất tô sạch & nghỉ</button>');
  const run=session(context,'washing-game',()=>S.finishWashing(game));let lastPoint=null;
  function paint(){const wash=S.washingInfo(game);dialog.querySelector('#wash-progress').value=wash.progress;dialog.querySelector('#wash-status').textContent=wash.done?`Đã cất ${wash.recovered} tô sạch vào kho.`:`${Math.ceil(15-wash.elapsed)} giây · Đã rửa ${wash.completed}/${wash.frames} · ${wash.total} tô trong chồng`;if(wash.done){run.stop();dialog.querySelector('#scrub-bowl').disabled=true;persist();render();}}
  function scrub(){const result=S.scrubWashing(game);if(result.ok){persist();paint();}}
  const bowl=dialog.querySelector('#scrub-bowl');bowl.onclick=scrub;bowl.onpointerdown=event=>{lastPoint={x:event.clientX,y:event.clientY};bowl.setPointerCapture(event.pointerId);};bowl.onpointerup=()=>{lastPoint=null;};bowl.onpointercancel=()=>{lastPoint=null;};bowl.onpointermove=event=>{if(!lastPoint)return;if(Math.hypot(event.clientX-lastPoint.x,event.clientY-lastPoint.y)>=8){lastPoint={x:event.clientX,y:event.clientY};scrub();}};bowl.onkeydown=event=>{if(event.code==='Space'){event.preventDefault();scrub();}};bowl.focus();paint();run.start(delta=>{S.tickWashing(game,delta);paint();},100);
}
