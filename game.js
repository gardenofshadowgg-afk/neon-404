/* NEON 404 — jogo original em JavaScript puro. Sem bibliotecas ou internet. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const canvas=$('screen'),ctx=canvas.getContext('2d',{alpha:false});
const radar=$('radar'),rc=radar.getContext('2d');
const overlay=$('overlay'),panel=$('menuPanel'),menuHTML=panel.innerHTML;
const hud=$('hud'),controls=$('controls'),topActions=$('topActions'),radarWrap=$('radarWrap');
const flash=$('damageFlash'),toastEl=$('sectorToast');
const SECTORS=[
 {name:'PORTÃO DE ENTRADA',theme:'#36eee9',dark:'#124b76',sky:'#070e29',floor:'#0d1c35'},
 {name:'JARDINS MAGNÉTICOS',theme:'#b9fa5c',dark:'#426c59',sky:'#10152a',floor:'#132a32'},
 {name:'DISTRITO SOLAR',theme:'#ffba4b',dark:'#81546a',sky:'#241327',floor:'#261e34'},
 {name:'NÚCLEO VIOLETA',theme:'#c292ff',dark:'#493987',sky:'#140d30',floor:'#1a173c'},
 {name:'CENTRAL 404',theme:'#ff6fb0',dark:'#693c83',sky:'#180d2d',floor:'#24142f'}
];
const GUNS=[
 {name:'BLASTER',ammo:Infinity,damage:34,delay:.28,range:12,color:'#54f7ed',spread:.065},
 {name:'ESPALHADOR',ammo:20,damage:88,delay:.69,range:7,color:'#ffe376',spread:.22},
 {name:'PLASMA',ammo:10,damage:125,delay:.57,range:14,color:'#f4a6ff',spread:.095}
];
const TAU=Math.PI*2,FOV=Math.PI/2.75,GRID=21,SAVE='neon404_save_v1';
let W=640,H=360,zBuffer=[],state='menu',level=0,world=[],enemies=[],pickups=[],portal=null;
let player={x:1.5,y:1.5,a:.65,hp:100},score=0,crystals=0,weapon=0,ammo=[Infinity,20,10],unlocks=[true,false,false];
let clock=0,lastFrame=0,lastShot=-10,shotFX=0,hitFX=0,shake=0,lastHurt=-10,portalMessage=-10,toastTime=0;
let enemiesRemaining=0,showRadar=false,soundOn=true,audio=null,isTouch=('ontouchstart' in window || navigator.maxTouchPoints>0);
let move={x:0,y:0,pointer:null},lookPointer=null,lookLastX=0,shootHeld=false;
const keys=new Set();
function rng(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function norm(a){return Math.atan2(Math.sin(a),Math.cos(a));}
function hexToRGB(hex){let x=parseInt(hex.slice(1),16);return [(x>>16)&255,(x>>8)&255,x&255];}
function tone(hex,m){const [r,g,b]=hexToRGB(hex);return `rgb(${clamp(Math.round(r*m),0,255)},${clamp(Math.round(g*m),0,255)},${clamp(Math.round(b*m),0,255)})`;}
function dist(x,y,xx,yy){return Math.hypot(xx-x,yy-y);}
function resetCanvas(){const scale=Math.min(1.12,window.devicePixelRatio||1)*.8;W=clamp(Math.floor(innerWidth*scale),300,980);H=clamp(Math.floor(innerHeight*scale),220,660);canvas.width=W;canvas.height=H;zBuffer=new Float32Array(Math.ceil(W/2)+1);ctx.imageSmoothingEnabled=false;}
window.addEventListener('resize',resetCanvas);resetCanvas();
function beep(freq=440,duration=.08,type='square',volume=.027,endFreq=null){if(!soundOn)return;try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);if(endFreq)o.frequency.exponentialRampToValueAtTime(endFreq,audio.currentTime+duration);g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration+.01);}catch(_){}}
function notify(text,seconds=2){toastEl.textContent=text;toastEl.classList.remove('hidden');toastTime=clock+seconds;}
function loadSave(){try{const s=JSON.parse(localStorage.getItem(SAVE)||'null');if(s&&Number.isInteger(s.level)&&s.level>=0&&s.level<5)return s;}catch(_){}return null;}
function saveProgress(){try{localStorage.setItem(SAVE,JSON.stringify({level,score,crystals,ammo:ammo.slice(1),unlocks,weapon,hp:player.hp}));}catch(_){}}
function clearSave(){try{localStorage.removeItem(SAVE);}catch(_){}}
function setVisiblePlay(yes){hud.classList.toggle('hidden',!yes);topActions.classList.toggle('hidden',!yes);controls.classList.toggle('hidden',!yes||!isTouch);radarWrap.classList.toggle('hidden',!yes||!showRadar);}
function panelShow(html){panel.innerHTML=html;overlay.classList.remove('hidden');setVisiblePlay(false);}
function showHome(){state='menu';shootHeld=false;panel.innerHTML=menuHTML;const s=loadSave();$('continueButton').classList.toggle('hidden',!s);overlay.classList.remove('hidden');setVisiblePlay(false);}
function showHelp(){ $('instructions').classList.remove('hidden'); }
function hideHelp(){ $('instructions').classList.add('hidden'); }
function showPause(){if(state!=='playing')return;state='paused';shootHeld=false;panelShow(`<div class="eyebrow">NEON 404 / CENTRAL DE MISSÕES</div><h2>MISSÃO PAUSADA</h2><p class="pitch">SETOR ${level+1} — ${SECTORS[level].name}<br>Robôs restantes: ${enemiesRemaining}<br>Pontuação: ${score}</p><div id="menuButtons"><button class="primary" data-act="resume">▶ VOLTAR AO JOGO</button><button data-act="retry">↻ RECOMEÇAR SETOR</button><button data-act="home">MENU PRINCIPAL</button></div>`);}
function resume(){state='playing';overlay.classList.add('hidden');setVisiblePlay(true);lastFrame=performance.now();}
function lose(){state='lost';shootHeld=false;beep(100,.36,'sawtooth',.045,40);panelShow(`<div class="eyebrow">SINAL INTERROMPIDO</div><h1>404</h1><p class="subtitle">TENTE NOVAMENTE</p><p class="pitch">Seus cristais e pontos ficam guardados até o começo deste setor. Continue tentando!</p><div id="menuButtons"><button class="primary" data-act="retry">↻ TENTAR DE NOVO</button><button data-act="home">MENU PRINCIPAL</button></div>`);}
function victory(){state='won';shootHeld=false;clearSave();beep(800,.46,'triangle',.04,1650);panelShow(`<div class="eyebrow">TRANSMISSÃO RESTABELECIDA</div><h1>VITÓRIA!</h1><p class="subtitle">CIDADE SALVA</p><p class="pitch">Você recuperou a CENTRAL 404!<br>◈ ${crystals} cristais coletados<br>★ ${score.toLocaleString('pt-BR')} pontos</p><div id="menuButtons"><button class="primary" data-act="new">▶ JOGAR NOVAMENTE</button><button data-act="home">MENU PRINCIPAL</button></div>`);}
function stageClear(){if(state!=='playing')return;beep(530,.3,'triangle',.04,980);score+=500*(level+1);player.hp=Math.min(100,player.hp+20);level++;if(level>=5){victory();return;}saveProgress();state='clear';shootHeld=false;panelShow(`<div class="eyebrow">PORTAL ATIVADO</div><h2>SETOR CONCLUÍDO!</h2><p class="subtitle">+ ${500*level} PONTOS DE BÔNUS</p><p class="pitch">Vida restaurada em até 20 pontos. Prepare-se para o próximo setor: <strong>${SECTORS[level].name}</strong>.</p><div id="menuButtons"><button class="primary" data-act="next">▶ PRÓXIMO SETOR</button><button data-act="home">MENU PRINCIPAL</button></div>`);}
function begin(newGame=false){if(newGame){level=0;score=0;crystals=0;ammo=[Infinity,20,10];unlocks=[true,false,false];weapon=0;player.hp=100;clearSave();}else{const s=loadSave();if(s){level=s.level;score=s.score||0;crystals=s.crystals||0;ammo=[Infinity,...(s.ammo||[20,10])];unlocks=s.unlocks||[true,false,false];weapon=unlocks[s.weapon]?s.weapon:0;player.hp=Math.max(50,s.hp||100);}else{begin(true);return;}}
 loadStage();resume();notify(`SETOR ${String(level+1).padStart(2,'0')} — ${SECTORS[level].name}`,3);
}
function generateMaze(seed){const R=rng(seed),m=Array.from({length:GRID},()=>Array(GRID).fill('#'));
 const stack=[[1,1]];m[1][1]='.';
 while(stack.length){const [x,y]=stack[stack.length-1],opts=[[2,0],[-2,0],[0,2],[0,-2]].filter(([dx,dy])=>x+dx>0&&y+dy>0&&x+dx<GRID-1&&y+dy<GRID-1&&m[y+dy][x+dx]==='#');
  if(!opts.length){stack.pop();continue;}const [dx,dy]=opts[Math.floor(R()*opts.length)];m[y+dy/2][x+dx/2]='.';m[y+dy][x+dx]='.';stack.push([x+dx,y+dy]);}
 // Abra conexões extras para navegação mais suave e menos becos sem saída.
 let holes=20+level*5,attempts=0;
 while(holes>0&&attempts++<400){const x=1+Math.floor(R()*(GRID-2)),y=1+Math.floor(R()*(GRID-2));if(m[y][x]!== '#')continue;
  if((m[y][x-1]==='.'&&m[y][x+1]==='.')||(m[y-1][x]==='.'&&m[y+1][x]==='.')){m[y][x]='.';holes--;}}
 // Abra pequenas áreas nos cruzamentos existentes.
 for(let n=0;n<15;n++){const x=2+Math.floor(R()*(GRID-4)),y=2+Math.floor(R()*(GRID-4));if(m[y][x]==='.'&&m[y][x+1]==='.'&&m[y+1][x]==='.')m[y+1][x+1]='.';}
 m[1][1]='.';m[GRID-2][GRID-2]='.';
 return m;
}
function ground(x,y){return world[Math.floor(y)]?.[Math.floor(x)]==='.';}
function free(x,y,r=.22){return ground(x-r,y-r)&&ground(x+r,y-r)&&ground(x-r,y+r)&&ground(x+r,y+r);}
function randomCells(seed){const R=rng(seed),cells=[];for(let y=1;y<GRID-1;y++)for(let x=1;x<GRID-1;x++)if(world[y][x]==='.'&&Math.hypot(x-1,y-1)>4&&Math.hypot(x-19,y-19)>2)cells.push({x:x+.5,y:y+.5});
 for(let i=cells.length-1;i>0;i--){let j=Math.floor(R()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]];}return cells;}
function loadStage(){clock=0;lastShot=-10;lastHurt=-10;shotFX=0;hitFX=0;shake=0;portalMessage=-10;
 world=generateMaze(404+(level+1)*287);player.x=1.5;player.y=1.5;player.a=.5;portal={x:19.5,y:19.5};enemies=[];pickups=[];
 const cells=randomCells(1800+level*191),count=6+3*level;
 for(let i=0;i<count;i++){const c=cells.shift();if(!c)break;let kind=i%5===0?'tank':i%2===0?'guard':'scout';const health=kind==='tank'?120:kind==='guard'?70:45;enemies.push({x:c.x,y:c.y,kind,hp:health,max:health,cooldown:.7+i*.16,wiggle:i*2,alive:true});}
 if(level===4){const c=cells.shift();if(c)enemies.push({x:c.x,y:c.y,kind:'boss',hp:520,max:520,cooldown:1.5,wiggle:0,alive:true});}
 for(let i=0;i<10+level*2;i++){let c=cells.shift();if(c)pickups.push({x:c.x,y:c.y,type:'crystal',alive:true});}
 for(let i=0;i<3;i++){let c=cells.shift();if(c)pickups.push({x:c.x,y:c.y,type:'health',alive:true});}
 for(let i=0;i<3;i++){let c=cells.shift();if(c)pickups.push({x:c.x,y:c.y,type:'ammo',alive:true});}
 if(level===1&&!unlocks[1]){const c=cells.shift();if(c)pickups.push({...c,type:'shotgun',alive:true});}
 if(level===2&&!unlocks[2]){const c=cells.shift();if(c)pickups.push({...c,type:'plasma',alive:true});}
 enemiesRemaining=enemies.length;showRadar=true;$('muteButton').textContent=soundOn?'♫':'♪';$('radarButton').textContent='◎';updateHUD();
}
function updateHUD(){ $('sectorLabel').textContent=String(level+1).padStart(2,'0')+' / 05';$('enemyLabel').textContent='ROBÔS: '+enemiesRemaining;$('scoreLabel').textContent=String(score).padStart(6,'0');$('healthLabel').textContent='✚ '+Math.max(0,Math.ceil(player.hp));$('weaponLabel').textContent=GUNS[weapon].name;$('ammoLabel').textContent=weapon===0?'∞':String(Math.max(0,Math.floor(ammo[weapon])));$('crystalLabel').textContent='◈ '+String(crystals).padStart(2,'0');$('objectiveLabel').textContent=enemiesRemaining?'DESATIVE OS ROBÔS':'ENCONTRE O PORTAL';}
function canSee(x,y,xx,yy){const d=dist(x,y,xx,yy);if(d<.1)return true;const dx=(xx-x)/d,dy=(yy-y)/d;for(let t=.17;t<d-.17;t+=.11)if(!ground(x+dx*t,y+dy*t))return false;return true;}
function chooseWeapon(){for(let j=1;j<=3;j++){const w=(weapon+j)%3;if(unlocks[w]&&(w===0||ammo[w]>0)){weapon=w;beep(380,.08,'triangle',.024,520);updateHUD();return;}}weapon=0;updateHUD();}
function setWeapon(i){if(unlocks[i]){weapon=i;beep(340,.07,'triangle',.022);updateHUD();}}
function shoot(){if(state!=='playing'||clock-lastShot<GUNS[weapon].delay)return;const gun=GUNS[weapon];if(weapon&&ammo[weapon]<=0){weapon=0;notify('SEM CARGA — BLASTER ATIVADO',1.25);updateHUD();return;}
 lastShot=clock;shotFX=.15;shake=.06;if(weapon)ammo[weapon]--;beep(weapon===2?250:weapon===1?130:530,.09,weapon===1?'sawtooth':'square',.033,weapon===2?740:120);
 let hit=null,minDist=99;
 for(const e of enemies){if(!e.alive)continue;const d=dist(player.x,player.y,e.x,e.y);if(d>gun.range)continue;const a=Math.abs(norm(Math.atan2(e.y-player.y,e.x-player.x)-player.a));const r=gun.spread+.23/d*(e.kind==='boss'?1.8:1);if(a<r&&d<minDist&&canSee(player.x,player.y,e.x,e.y)){hit=e;minDist=d;}}
 if(hit){let damage=gun.damage*(gun===GUNS[1]?clamp(1-minDist/11,.45,1):1);hit.hp-=damage;hitFX=.12;beep(240,.055,'triangle',.021,150);score+=10;
  if(hit.hp<=0){hit.alive=false;enemiesRemaining--;score+=hit.kind==='boss'?1000:hit.kind==='tank'?250:hit.kind==='guard'?150:100;beep(500,.15,'triangle',.032,1000);if(enemiesRemaining===0)notify('TODOS OS ROBÔS DESATIVADOS! ENCONTRE O PORTAL',3);}}
 updateHUD();}
function collect(p){p.alive=false;switch(p.type){case 'crystal':crystals++;score+=50;beep(750,.13,'sine',.025,1220);break;
 case 'health':if(player.hp<100){player.hp=Math.min(100,player.hp+30);beep(450,.2,'sine',.022,700);}else{score+=30;}break;
 case 'ammo':ammo[1]+=7;ammo[2]+=4;beep(380,.14,'triangle',.03,700);notify('ENERGIA DAS ARMAS RECARREGADA',1.35);break;
 case 'shotgun':unlocks[1]=true;weapon=1;ammo[1]+=20;notify('NOVA ARMA: ESPALHADOR!',2.4);beep(450,.42,'triangle',.035,940);break;
 case 'plasma':unlocks[2]=true;weapon=2;ammo[2]+=14;notify('NOVA ARMA: PLASMA!',2.4);beep(530,.42,'triangle',.035,1100);break;}
 updateHUD();}
function moveEntity(obj,dx,dy,r=.23){const nx=obj.x+dx,ny=obj.y+dy;if(free(nx,obj.y,r))obj.x=nx;if(free(obj.x,ny,r))obj.y=ny;}
function update(dt){clock+=dt;if(toastTime&&clock>toastTime){toastEl.classList.add('hidden');toastTime=0;}
 if(shotFX>0)shotFX-=dt;if(hitFX>0)hitFX-=dt;if(shake>0)shake-=dt;
 let forward=0,strafe=0,turn=0;
 if(keys.has('w')||keys.has('arrowup'))forward++;if(keys.has('s')||keys.has('arrowdown'))forward--;
 if(keys.has('a'))strafe--;if(keys.has('d'))strafe++;
 if(keys.has('arrowleft')||keys.has('q'))turn--;if(keys.has('arrowright')||keys.has('e'))turn++;
 player.a=norm(player.a+turn*dt*2.4);
 forward+=-move.y;strafe+=move.x;
 const motion=Math.hypot(forward,strafe),speed=2.85*dt/Math.max(1,motion);
 moveEntity(player,(Math.cos(player.a)*forward-Math.sin(player.a)*strafe)*speed,(Math.sin(player.a)*forward+Math.cos(player.a)*strafe)*speed,.19);
 if(shootHeld||keys.has(' '))shoot();
 let attacks=0;
 for(const e of enemies){if(!e.alive)continue;const d=dist(e.x,e.y,player.x,player.y);e.wiggle+=dt*3;
  if(d<8.5&&canSee(e.x,e.y,player.x,player.y)){
   if(d>1.6){let sp=(e.kind==='boss'?.65:e.kind==='tank'?.67:e.kind==='guard'?.82:1.02)*dt;moveEntity(e,((player.x-e.x)/d)*sp,((player.y-e.y)/d)*sp,e.kind==='boss'?.33:.24);}
   e.cooldown-=dt;
   if(e.cooldown<=0){e.cooldown=(e.kind==='boss'?1.6:2.4)+(Math.sin(e.x*9+e.y)*.3);if(attacks<2){attacks++;if(clock-lastHurt>.46){const dmg=(e.kind==='boss'?12:e.kind==='tank'?9:6);player.hp-=dmg;lastHurt=clock;flash.style.opacity='.65';setTimeout(()=>{flash.style.opacity='0';},115);beep(175,.12,'sawtooth',.03,85);updateHUD();if(player.hp<=0){lose();return;}}}}
  }else e.cooldown=Math.max(.5,e.cooldown-dt*.2);
 }
 for(const p of pickups)if(p.alive&&dist(player.x,player.y,p.x,p.y)<.57)collect(p);
 if(dist(player.x,player.y,portal.x,portal.y)<.85){if(enemiesRemaining===0){stageClear();return;}if(clock-portalMessage>3.3){notify(`AINDA RESTAM ${enemiesRemaining} ROBÔS`,2);portalMessage=clock;}}
}
function renderWorld(){const theme=SECTORS[level];
 let sky=ctx.createLinearGradient(0,0,0,H*.56);sky.addColorStop(0,theme.sky);sky.addColorStop(1,'#182e56');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H*.55);
 let floor=ctx.createLinearGradient(0,H*.49,0,H);floor.addColorStop(0,theme.floor);floor.addColorStop(1,'#020617');ctx.fillStyle=floor;ctx.fillRect(0,H*.49,W,H);
 // Céu colorido e linhas do piso criam profundidade sem texturas externas.
 ctx.globalAlpha=.22;for(let i=0;i<12;i++){const x=((((i*137.4-player.a*75)%W)+W)%W),y=20+(i*47)%(Math.max(35,H*.35));ctx.fillStyle=i%2?theme.theme:'#ffffff';ctx.fillRect(x,y,1.5,1.5);}ctx.globalAlpha=1;
 ctx.strokeStyle=tone(theme.theme,.31);ctx.lineWidth=1;
 for(let i=1;i<=8;i++){let y=H*.5+(H*.5)*(1-1/(1+i*.42));ctx.globalAlpha=.07+i*.009;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}ctx.globalAlpha=1;
 const rayStep=2,proj=H*.86;
 for(let sx=0;sx<W;sx+=rayStep){const ra=player.a+Math.atan((sx-W/2)/(W/2)*Math.tan(FOV/2))*1.0;
  const dx=Math.cos(ra),dy=Math.sin(ra);let mx=Math.floor(player.x),my=Math.floor(player.y),side=0;
  const ddx=Math.abs(1/(Math.abs(dx)<1e-8?1e-8:dx)),ddy=Math.abs(1/(Math.abs(dy)<1e-8?1e-8:dy));
  const stepX=dx<0?-1:1,stepY=dy<0?-1:1;
  let sdX=(dx<0?player.x-mx:mx+1-player.x)*ddx,sdY=(dy<0?player.y-my:my+1-player.y)*ddy;
  for(let i=0;i<48;i++){if(sdX<sdY){sdX+=ddx;mx+=stepX;side=0;}else{sdY+=ddy;my+=stepY;side=1;}if(world[my]?.[mx]!=='.')break;}
  let raw=side===0?sdX-ddx:sdY-ddy;raw=Math.max(.045,raw);const dep=raw*Math.cos(ra-player.a);zBuffer[sx>>1]=dep;
  let size=Math.min(H*3,proj/Math.max(.12,dep)),top=Math.round((H-size)/2),bottom=top+size;
  const shade=clamp(1-dep/16,.14,1)*(side?.76:1),tile=Math.abs(Math.sin(mx*4.7+my*5.1));
  ctx.fillStyle=tone(theme.dark,(.7+tile*.2)*shade);ctx.fillRect(sx,top,rayStep+1,size);
  const hitPos=side===0?player.y+raw*dy:player.x+raw*dx;const edge=hitPos-Math.floor(hitPos);
  if(edge<.045||edge>.955){ctx.fillStyle=tone(theme.theme,.52*shade);ctx.fillRect(sx,top,rayStep+1,size);}else{
   ctx.fillStyle=tone(theme.theme,.26*shade);ctx.fillRect(sx,top+size*.14,rayStep+1,Math.max(1,size*.012));ctx.fillRect(sx,top+size*.74,rayStep+1,Math.max(1,size*.013));
   if(((mx*3+my*5)%7)===0){ctx.fillStyle=tone(theme.theme,.4*shade);ctx.fillRect(sx,top+size*.28,rayStep+1,size*.04);}
  }
 }
}
function drawPortal(x,y,s,t){ctx.save();ctx.translate(x,y);const pulse=1+Math.sin(t*4)*.05;ctx.scale(pulse,pulse);ctx.shadowColor=SECTORS[level].theme;ctx.shadowBlur=s*.30;ctx.strokeStyle=SECTORS[level].theme;ctx.lineWidth=Math.max(3,s*.08);ctx.beginPath();ctx.ellipse(0,0,s*.25,s*.49,0,0,TAU);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=enemiesRemaining?'#f55a95':'#42eeca';ctx.globalAlpha=.27;ctx.beginPath();ctx.ellipse(0,0,s*.18,s*.41,0,0,TAU);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle='#e9ffff';ctx.font=`bold ${Math.max(9,s*.105)}px sans-serif`;ctx.textAlign='center';ctx.fillText(enemiesRemaining?'BLOQUEADO':'SAÍDA',0,-s*.57);ctx.restore();}
function drawItem(p,x,y,s){ctx.save();ctx.translate(x,y+Math.sin(clock*3+p.x)*s*.055);let color=p.type==='crystal'?'#82f9ff':p.type==='health'?'#7fff9a':p.type==='ammo'?'#ffe67c':'#f9abff';ctx.shadowColor=color;ctx.shadowBlur=s*.16;ctx.fillStyle=color;
 if(p.type==='crystal'){ctx.beginPath();ctx.moveTo(0,-s*.42);ctx.lineTo(s*.25,0);ctx.lineTo(0,s*.4);ctx.lineTo(-s*.25,0);ctx.closePath();ctx.fill();ctx.fillStyle='#fff';ctx.fillRect(-s*.025,-s*.24,s*.06,s*.30);}else{
 ctx.fillStyle='#112b44';ctx.fillRect(-s*.3,-s*.27,s*.6,s*.54);ctx.strokeStyle=color;ctx.lineWidth=Math.max(2,s*.048);ctx.strokeRect(-s*.3,-s*.27,s*.6,s*.54);ctx.fillStyle=color;ctx.font=`bold ${s*.4}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.type==='health'?'+':p.type==='ammo'?'⚡':'★',0,0);}
 ctx.restore();}
function drawRobot(e,x,y,s){ctx.save();ctx.translate(x,y);let color=e.kind==='boss'?'#ff6db8':e.kind==='tank'?'#ffc46f':e.kind==='guard'?'#a5a1ff':'#63f4ed';const bob=Math.sin(e.wiggle)*s*.018;ctx.translate(0,bob);const b=e.kind==='boss'?1.22:1;
 ctx.shadowColor=color;ctx.shadowBlur=s*.13;
 ctx.fillStyle='#101d37';ctx.strokeStyle=color;ctx.lineWidth=Math.max(2,s*.025);
 // Pernas mecânicas.
 for(const v of [-1,1]){ctx.fillRect(v*s*.12-s*.08,s*.14,s*.15,s*.30);ctx.strokeRect(v*s*.12-s*.08,s*.14,s*.15,s*.30);}
 // Braços, corpo, visor e núcleo de energia.
 ctx.fillStyle='#24385c';ctx.fillRect(-s*.36,-s*.20,s*.18,s*.4);ctx.fillRect(s*.18,-s*.20,s*.18,s*.4);
 ctx.fillStyle='#102c4a';ctx.fillRect(-s*.20,-s*.22,s*.4,s*.48);ctx.strokeRect(-s*.2,-s*.22,s*.4,s*.48);
 ctx.fillStyle=color;ctx.fillRect(-s*.27,-s*.36,s*.54,s*.23);ctx.fillStyle='#071d33';ctx.fillRect(-s*.22,-s*.305,s*.44,s*.13);
 ctx.fillStyle='#f8ffff';ctx.fillRect(-s*.16,-s*.27,s*.11,s*.047);ctx.fillRect(s*.06,-s*.27,s*.11,s*.047);
 ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,s*.017,s*.11,0,TAU);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,s*.017,s*.041,0,TAU);ctx.fill();
 if(e.kind==='boss'){ctx.fillStyle=color;ctx.fillRect(-s*.33,-s*.45,s*.12,s*.15);ctx.fillRect(s*.21,-s*.45,s*.12,s*.15);}
 ctx.shadowBlur=0;if(e.hp<e.max){ctx.fillStyle='#191c2a';ctx.fillRect(-s*.28,-s*.52,s*.56,s*.06);ctx.fillStyle='#7bff9b';ctx.fillRect(-s*.28,-s*.52,s*.56*clamp(e.hp/e.max,0,1),s*.06);}
 ctx.restore();}
function renderObjects(){const objs=[...enemies.filter(e=>e.alive).map(e=>({...e,type:'enemy'})),...pickups.filter(p=>p.alive),{...portal,type:'portal'}];objs.sort((a,b)=>dist(player.x,player.y,b.x,b.y)-dist(player.x,player.y,a.x,a.y));
 for(const o of objs){const d=dist(player.x,player.y,o.x,o.y),ang=norm(Math.atan2(o.y-player.y,o.x-player.x)-player.a);
  if(d<.15||Math.abs(ang)>FOV*.85)continue;
  const depth=d*Math.cos(ang),x=W*.5+Math.tan(ang)*W/(2*Math.tan(FOV/2));const idx=clamp(Math.floor(x/2),0,zBuffer.length-1);
  if(depth>zBuffer[idx]+.3)continue;
  let s=Math.min(H*2,H/(depth*.85));if(o.type==='portal'){drawPortal(x,H*.5,s,clock);continue;}
  if(o.type==='enemy'){drawRobot(o,x,H*.50+s*.02,s*(o.kind==='boss'?1.06:.75));continue;}
  drawItem(o,x,H*.59+s*.07,s*.47);
 }
}
function renderWeapon(){const cx=W*.5+(shake>0?Math.sin(clock*90)*shake*W*.03:0),scale=Math.min(W*.37,H*.61);const recoil=shotFX>0?shotFX*scale*.7:0;ctx.save();ctx.translate(cx,H+scale*.21+recoil);
 const color=GUNS[weapon].color;ctx.shadowColor=color;ctx.shadowBlur=12;
 ctx.fillStyle='#121d37';ctx.beginPath();ctx.moveTo(-scale*.29,0);ctx.lineTo(-scale*.19,-scale*.51);ctx.lineTo(-scale*.1,-scale*.62);ctx.lineTo(scale*.10,-scale*.62);ctx.lineTo(scale*.19,-scale*.51);ctx.lineTo(scale*.29,0);ctx.closePath();ctx.fill();
 ctx.strokeStyle=color;ctx.lineWidth=Math.max(2,scale*.025);ctx.stroke();ctx.shadowBlur=0;
 ctx.fillStyle='#30496d';ctx.fillRect(-scale*.105,-scale*.66,scale*.21,scale*.36);ctx.fillStyle=color;ctx.fillRect(-scale*.058,-scale*.67,scale*.116,scale*.26);
 ctx.fillStyle='#132942';ctx.fillRect(-scale*.24,-scale*.23,scale*.48,scale*.28);ctx.strokeStyle=color;ctx.strokeRect(-scale*.24,-scale*.23,scale*.48,scale*.28);
 if(shotFX>0){ctx.fillStyle='#fff0ae';ctx.shadowColor=color;ctx.shadowBlur=25;ctx.beginPath();ctx.moveTo(0,-scale*.70);ctx.lineTo(-scale*.18,-scale*1.05);ctx.lineTo(0,-scale*.9);ctx.lineTo(scale*.18,-scale*1.05);ctx.closePath();ctx.fill();}
 ctx.restore();
 // Mira dinâmica.
 const h=W*.5,v=H*.48;ctx.strokeStyle=hitFX>0?'#ff6b87':'#e9ffff';ctx.lineWidth=Math.max(1,Math.floor(W/500));ctx.beginPath();ctx.moveTo(h-13,v);ctx.lineTo(h-5,v);ctx.moveTo(h+5,v);ctx.lineTo(h+13,v);ctx.moveTo(h,v-13);ctx.lineTo(h,v-5);ctx.moveTo(h,v+5);ctx.lineTo(h,v+13);ctx.stroke();
}
function renderRadar(){if(!showRadar||state!=='playing')return;const rw=radar.width,rh=radar.height,cell=rw/GRID;rc.fillStyle='#02091bf2';rc.fillRect(0,0,rw,rh);
 for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++)if(world[y][x]==='#'){rc.fillStyle='#285678';rc.fillRect(x*cell,y*cell,cell+.3,cell+.3);}
 rc.fillStyle=enemiesRemaining?'#ff7b9f':'#81ffc0';rc.fillRect((portal.x-.5)*cell,(portal.y-.5)*cell,cell,cell);
 for(const p of pickups)if(p.alive){rc.fillStyle=p.type==='crystal'?'#85f8ff':'#ffdb65';rc.fillRect((p.x-.3)*cell,(p.y-.3)*cell,cell*.35,cell*.35);}
 for(const e of enemies)if(e.alive){rc.fillStyle=e.kind==='boss'?'#ff23a7':'#fd7d7d';rc.beginPath();rc.arc(e.x*cell,e.y*cell,2.1,0,TAU);rc.fill();}
 rc.save();rc.translate(player.x*cell,player.y*cell);rc.rotate(player.a);rc.fillStyle='#fff';rc.beginPath();rc.moveTo(6,0);rc.lineTo(-4,-3.8);rc.lineTo(-4,3.8);rc.closePath();rc.fill();rc.restore();}
function render(){if(state!=='playing')return;renderWorld();renderObjects();renderWeapon();renderRadar();}
function loop(now){const dt=Math.min(.035,(now-lastFrame)/1000||.016);lastFrame=now;if(state==='playing'){update(dt);if(state==='playing')render();}requestAnimationFrame(loop);}
requestAnimationFrame(loop);
// Delegação para os menus recriados dinamicamente.
overlay.addEventListener('click',ev=>{const el=ev.target.closest('button');if(!el)return;switch(el.dataset.act||el.id){case 'startButton':case 'new':begin(true);break;case 'continueButton':begin(false);break;case 'instructionsButton':showHelp();break;case 'resume':resume();break;case 'retry':loadStage();resume();notify(`SETOR ${level+1} REINICIADO`,2);break;case 'next':loadStage();resume();notify(`SETOR ${level+1} — ${SECTORS[level].name}`,3);break;case 'home':showHome();break;}});
$('closeInstructions').addEventListener('click',hideHelp);
$('pauseButton').addEventListener('click',showPause);
$('radarButton').addEventListener('click',()=>{showRadar=!showRadar;radarWrap.classList.toggle('hidden',!showRadar);});
$('muteButton').addEventListener('click',()=>{soundOn=!soundOn;$('muteButton').textContent=soundOn?'♫':'♪';});
$('switchButton').addEventListener('click',chooseWeapon);
$('shootButton').addEventListener('pointerdown',ev=>{ev.preventDefault();ev.stopPropagation();shootHeld=true;ev.currentTarget.classList.add('firing');shoot();try{ev.currentTarget.setPointerCapture(ev.pointerId);}catch(_){}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('shootButton').addEventListener(event,()=>{shootHeld=false;$('shootButton').classList.remove('firing');});
const moveZone=$('moveZone'),stick=$('stickBase'),knob=$('stickKnob');
function joystick(ev){const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,radius=r.width*.36;let dx=ev.clientX-cx,dy=ev.clientY-cy;const d=Math.max(radius,Math.hypot(dx,dy));move.x=clamp(dx/d,-1,1);move.y=clamp(dy/d,-1,1);knob.style.transform=`translate(${move.x*radius}px,${move.y*radius}px)`;}
moveZone.addEventListener('pointerdown',ev=>{if(move.pointer!==null)return;move.pointer=ev.pointerId;moveZone.setPointerCapture(ev.pointerId);joystick(ev);});
moveZone.addEventListener('pointermove',ev=>{if(ev.pointerId===move.pointer)joystick(ev);});
function endMove(ev){if(move.pointer!==ev.pointerId)return;move.pointer=null;move.x=0;move.y=0;knob.style.transform='translate(0,0)';}
moveZone.addEventListener('pointerup',endMove);moveZone.addEventListener('pointercancel',endMove);moveZone.addEventListener('lostpointercapture',endMove);
const lookZone=$('lookZone');lookZone.addEventListener('pointerdown',ev=>{if(lookPointer!==null)return;lookPointer=ev.pointerId;lookLastX=ev.clientX;lookZone.setPointerCapture(ev.pointerId);});
lookZone.addEventListener('pointermove',ev=>{if(ev.pointerId===lookPointer){player.a=norm(player.a+(ev.clientX-lookLastX)*.0065);lookLastX=ev.clientX;}});
for(const event of ['pointercancel','pointerup','lostpointercapture'])lookZone.addEventListener(event,ev=>{if(ev.pointerId===lookPointer)lookPointer=null;});
canvas.addEventListener('pointerdown',ev=>{if(state!=='playing'||isTouch)return;if(document.pointerLockElement!==canvas)canvas.requestPointerLock?.();shootHeld=true;shoot();});
window.addEventListener('pointerup',()=>{if(!isTouch)shootHeld=false;});
document.addEventListener('mousemove',ev=>{if(document.pointerLockElement===canvas&&state==='playing')player.a=norm(player.a+ev.movementX*.0031);});
window.addEventListener('keydown',ev=>{const k=ev.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))ev.preventDefault();if(k==='escape'||k==='p'){if(state==='playing')showPause();else if(state==='paused')resume();return;}if(k==='m'&&state==='playing'){showRadar=!showRadar;radarWrap.classList.toggle('hidden',!showRadar);return;}if('123'.includes(k)&&state==='playing')setWeapon(Number(k)-1);keys.add(k);});
window.addEventListener('keyup',ev=>keys.delete(ev.key.toLowerCase()));
window.addEventListener('blur',()=>{keys.clear();shootHeld=false;move.x=0;move.y=0;if(state==='playing')showPause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')showPause();});
window.addEventListener('contextmenu',ev=>ev.preventDefault());
// O service worker grava todos os arquivos localmente após a primeira abertura no GitHub Pages.
if('serviceWorker' in navigator && location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
showHome();
})();
