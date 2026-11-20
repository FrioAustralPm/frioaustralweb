/* Frío Austral v5 · medios (feat/media-frioaustral)
   MEDIA_BASE: cambiar a la URL de Vercel Blob (p.ej. 'https://xxxx.public.blob.vercel-storage.com/frio-austral/') al publicar. */
(()=>{const MEDIA_BASE=window.FA_MEDIA_BASE||'media/video/';
const rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
const c=navigator.connection||{};const small=matchMedia('(max-width: 879px)').matches||c.saveData===true;
const q=small?'720':'1080';
const src=(n,qq)=>`<source src="${MEDIA_BASE}${n}-${qq}.mp4" type="video/mp4"><source src="${MEDIA_BASE}${n}-${qq}.webm" type="video/webm">`;
/* video cambiado desde el panel (assets/fa-medios.js): una sola fuente, sin subtítulos del original */
const ovr=n=>(window.FA_MEDIA_OVERRIDE&&window.FA_MEDIA_OVERRIDE[n])||'';
/* Etapas de carga: (video del panel) -> calidad según pantalla -> 720. Si una etapa falla del todo
   (404, códec que el navegador no decodifica), se pasa a la siguiente; así nunca queda un video muerto. */
const fix=v=>{const n=v.dataset.media,o=ovr(n),t=v.querySelector('track');
 const st=[];
 if(o){if(t)t.remove();st.push(`<source src="${o}" type="${/\.webm(\?|$)/i.test(o)?'video/webm':'video/mp4'}">`)}
 st.push(src(n,q));if(q!=='720')st.push(src(n,'720'));
 let i=0,last=0;
 const apply=()=>{v.querySelectorAll('source').forEach(x=>x.remove());v.insertAdjacentHTML('afterbegin',st[i]);const ss=v.querySelectorAll('source');const cur=i;ss[ss.length-1].addEventListener('error',()=>next(cur))};
 const next=from=>{if(from!==i||i+1>=st.length||Date.now()-last<300)return;last=Date.now();i++;apply();v.load();v.dispatchEvent(new Event('fa-fallback'))};
 v.addEventListener('error',()=>next(i));
 apply();
 if(!o&&t)t.src=MEDIA_BASE+n+'.es.vtt';
 return ()=>next(i)};
const capsOn=v=>{for(const t of v.textTracks)if(t.kind==='captions')t.mode='showing'};
/* Hero V1 — reproductor nativo simple, pensado para iPhone/Safari iOS:
   - <video muted playsinline> con UNA sola fuente (src directo): MP4 H.264 primero, WebM solo si el navegador no decodifica MP4.
   - Siempre visible (nada de opacity:0 ni de esperar el evento "playing": iOS no reproduce ni pausa un video "no visible" por CSS).
   - Autoplay mudo con play() explícito; si iOS lo bloquea (Modo de bajo consumo, ahorro de datos) queda el poster,
     el botón "Reproducir video" y cualquier toque sobre el video reproduce (gesto del usuario => siempre funciona).
   - Sin bucles de re-mute/re-play: no se modifica el volumen del elemento (en iOS es de solo lectura).
   - Botón "Activar sonido": solo con un toque; reinicia en el frame 0. */
const cands=(v,n,o)=>{const l=[];const qs=q==='720'?['720']:[q,'720'];
 if(o)l.push(o);
 qs.forEach(x=>l.push(`${MEDIA_BASE}${n}-${x}.mp4`));qs.forEach(x=>l.push(`${MEDIA_BASE}${n}-${x}.webm`));
 const can=u=>{try{return v.canPlayType(/\.webm(\?|$)/i.test(u)?'video/webm':'video/mp4')!==''}catch(e){return true}};
 const ok=l.filter(can);return ok.length?ok:l};
function hero(){const v=document.querySelector('.hero video.hero-vid[data-media]');const btn=document.querySelector('.hero .fa-sound');
 if(!v){if(btn)btn.hidden=true;return}
 const hb=v.closest('.hero');const n=v.dataset.media,o=ovr(n),t=v.querySelector('track');
 const pi=document.querySelector('.fa-hero-poster img');v.poster=(pi&&pi.currentSrc)||'media/img/i1-hero-poster-960.webp';
 if(o&&t)t.remove();
 /* controles agrupados en una zona libre (nunca sobre la cara): reproducir / sonido / subtítulos */
 const ctl=document.createElement('div');ctl.className='fa-ctl';
 const play=document.createElement('button');play.type='button';play.className='fa-sound fa-play';play.hidden=true;
 play.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>Reproducir video</span>';
 const cc=document.createElement('button');cc.type='button';cc.className='fa-sound fa-cc';cc.setAttribute('aria-pressed','true');cc.setAttribute('aria-label','Ocultar subtítulos');cc.title='Ocultar subtítulos';
 cc.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6"/><path d="M16.5 10.2a2.2 2.2 0 1 0 0 3.6"/><path class="x" d="M4 20 20 4"/></svg>';
 ctl.appendChild(play);if(btn)ctl.appendChild(btn);ctl.appendChild(cc);hb.appendChild(ctl);
 let want=!rm,inView=true,on=false,started=false,stuck=0,lastT=0,i=0,adv=false;
 const list=cands(v,n,o);
 const mute=()=>{if(on)return;v.muted=true;v.defaultMuted=true};
 v.muted=true;v.defaultMuted=true;
 v.setAttribute('muted','');v.setAttribute('playsinline','');v.setAttribute('webkit-playsinline','');v.playsInline=true;v.setAttribute('disableremoteplayback','');
 if(!rm)v.autoplay=true;
 const showPlay=()=>{hb.classList.add('fa-blocked');play.hidden=false};
 const hidePlay=()=>{hb.classList.remove('fa-blocked');play.hidden=true};
 /* siguiente fuente (404, códec que el navegador no decodifica); la última vez deja el botón */
 const next=()=>{if(i+1>=list.length||adv)return false;adv=true;i++;v.src=list[i];v.load();setTimeout(()=>{adv=false},300);attempt();return true};
 const attempt=()=>{want=true;mute();try{const p=v.play();if(p&&p.catch)p.catch(e=>{const nm=e&&e.name;if(nm==='AbortError')return;if(nm==='NotSupportedError'&&next())return;showPlay()})}catch(e){showPlay()}};
 v.addEventListener('error',()=>{if(!next())showPlay()});
 v.addEventListener('playing',()=>{started=true;stuck=0;hidePlay();v.closest('.ph-img').classList.add('fa-playing')});
 /* si el sistema pausa el video (bajo consumo, otra app, etc.) no se entra en un bucle: se ofrece el botón */
 v.addEventListener('pause',()=>{if(on||!want||document.hidden||!inView||v.ended)return;setTimeout(()=>{if(v.paused&&want&&!document.hidden)showPlay()},350)});
 const kick=()=>{if(want&&v.paused&&inView&&!document.hidden&&!rm)attempt()};
 document.addEventListener('visibilitychange',kick);
 v.src=list[0];v.preload='metadata';
 if(rm)showPlay();else attempt();
 /* vigilante: si el video no avanza (~3 s) aunque debería, se muestra el botón (y una vez se prueba la siguiente fuente) */
 setInterval(()=>{if(!want||document.hidden||!inView)return;
  if(!v.paused&&v.currentTime>lastT+0.05){lastT=v.currentTime;stuck=0;hidePlay();return}
  lastT=Math.max(lastT,v.currentTime);
  stuck++;if(stuck===3)showPlay();if(stuck===5&&!started)next()},1000);
 /* tocar el botón o el video reproduce (gesto del usuario); además el primer toque en la página reintenta el autoplay */
 const user=()=>{stuck=0;attempt()};
 play.addEventListener('click',user);
 hb.addEventListener('click',e=>{if(!v.paused||e.target.closest('a,button,input,select,textarea,summary,label'))return;if(hb.classList.contains('fa-blocked')||!started)user()});
 if(!rm)['pointerdown','keydown','touchend'].forEach(ev=>addEventListener(ev,()=>{if(!started)attempt()},{once:true,passive:true}));
 const set=()=>{if(!btn)return;btn.setAttribute('aria-pressed',on?'true':'false');const x=on?'Silenciar':'Activar sonido';btn.setAttribute('aria-label',x);btn.title=x};
 if(btn){btn.hidden=false;btn.addEventListener('click',()=>{on=!on;if(on){v.currentTime=0;v.muted=false;const p=v.play();if(p&&p.catch)p.catch(()=>{on=false;mute();attempt();set()})}else{mute();if(v.paused)attempt()}set()})}
 if('IntersectionObserver' in window){new IntersectionObserver(es=>es.forEach(e=>{inView=e.isIntersecting;if(on)v.muted=!inView;else if(inView)kick()}),{threshold:.35}).observe(v)}
 /* subtítulos propios: sobre el torso, nunca sobre la cara; se pueden ocultar */
 const cap=document.createElement('p');cap.className='fa-cap';cap.setAttribute('aria-hidden','true');hb.appendChild(cap);
 cc.addEventListener('click',()=>{const off=!cap.classList.contains('off');cap.classList.toggle('off',off);cc.setAttribute('aria-pressed',off?'false':'true');const x=off?'Mostrar subtítulos':'Ocultar subtítulos';cc.setAttribute('aria-label',x);cc.title=x});
 const place=()=>{if(matchMedia('(max-width: 879px)').matches){cap.style.top='';cap.style.bottom='';cap.style.right=''}else{cap.style.top='';const w=hb.querySelector('.who');if(w){const hr=hb.getBoundingClientRect(),wr=w.getBoundingClientRect();cap.style.bottom=Math.round(hr.bottom-wr.top+14)+'px';cap.style.right=Math.round(hr.right-wr.right)+'px'}}};place();addEventListener('resize',place);
 const tr=v.textTracks&&v.textTracks[0];if(tr){tr.mode='hidden';tr.addEventListener('cuechange',()=>{const c=tr.activeCues&&tr.activeCues[0];cap.textContent=c?c.text.replace(/\n/g,' '):'';cap.classList.toggle('on',!!c)})}}
/* V2 y otros: click-to-play, se cargan al acercarse al viewport */
function lazy(){const vs=document.querySelectorAll('video.fa-lazyvid[data-media]');if(!vs.length)return;
 const go=v=>{if(v.dataset.ok)return;v.dataset.ok=1;fix(v);v.preload='metadata';v.load()};
 if(!('IntersectionObserver' in window))return vs.forEach(go);
 const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){go(e.target);io.unobserve(e.target)}}),{rootMargin:'300px'});
 vs.forEach(v=>{if(!small&&v.poster)v.poster=v.poster.replace('-960.webp','-1080.webp');io.observe(v);v.addEventListener('play',()=>capsOn(v),{once:true})})}
/* el video del hero parte después de la carga para no competir con el LCP (poster P1) */
const later=f=>{const go=()=>('requestIdleCallback' in window)?requestIdleCallback(f,{timeout:2500}):setTimeout(f,600);document.readyState==='complete'?go():addEventListener('load',go,{once:true})};
/* video existente del bloque Taller (index): mismo contenido, ahora carga al acercarse */
function taller(){const tv=document.querySelector('video.fa-tvid[data-lazy]');if(!tv)return;
 const go=()=>{const mob=matchMedia('(max-width: 879px)').matches;tv.poster=tv.dataset.poster;
  if(mob&&tv.dataset.movil){tv.poster=tv.dataset.movilPoster;tv.innerHTML=`<source src="${tv.dataset.movil}.webm" type="video/webm"><source src="${tv.dataset.movil}.mp4" type="video/mp4">`}
  else tv.querySelectorAll('source[data-src]').forEach(s=>s.src=s.dataset.src);
  tv.preload='metadata';tv.load();if(!rm)tv.play().catch(()=>{})};
 if(!('IntersectionObserver' in window))return go();
 const io=new IntersectionObserver(e=>{if(e[0].isIntersecting){io.disconnect();go()}},{rootMargin:'400px'});io.observe(tv)}
const run=()=>{later(hero);lazy();taller()};
/* espera (máx. 2,5 s) a saber si hay videos nuevos del panel */
const boot=()=>Promise.resolve(window.FA_MEDIA_READY).then(run,run);
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
