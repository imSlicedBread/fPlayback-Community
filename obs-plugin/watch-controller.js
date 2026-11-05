// SPDX-License-Identifier: GPL-2.0-or-later
/* Runs only in the OBS browser panel's normal YouTube watch page. No network,
 * cookies, account details, or confirmation buttons are accessed here. */
(() => {
  const command = __PLAYBACK_COMMAND__;
  // QCef can finish creating its initial homepage after a queued setURL call.
  // Recover only that startup page; never navigate account or other watch pages.
  if (location.origin === 'https://www.youtube.com' && location.pathname === '/') {
    location.replace('https://www.youtube.com/watch?v=' + command.videoId); return;
  }
  if (location.origin !== 'https://www.youtube.com' || location.pathname !== '/watch' ||
      new URL(location.href).searchParams.get('v') !== command.videoId) return;
  const isAdvertisement = () => {
    const currentPlayer = document.querySelector('#movie_player');
    return currentPlayer?.classList.contains('ad-showing') || currentPlayer?.classList.contains('ad-interrupting') || false;
  };
  const previous = window.__fPlaybackWatch;
  const video = document.querySelector('video.html5-main-video');
  const now = performance.now();
  const sameGeneration = previous?.nonce === command.nonce && previous?.generation === command.generation;
  const preservePosition=!sameGeneration && command.transportOnly===true && previous?.applied &&
    previous.video===video && previous.latestCommand?.videoId===command.videoId && !isAdvertisement();
  if (!sameGeneration) { previous?.detach?.(); previous?.detachAdGuard?.(); }
  const state = sameGeneration ? previous
    : { nonce: command.nonce, generation: command.generation, applied: false, played: false, progressAt: now, lastPosition: null, autoplayBlocked: false };
  if (preservePosition) {
    state.applied=true; state.played=previous.played;
    state.checkpoint=previous.checkpoint; state.checkpointAt=previous.checkpointAt;
    state.positionGuardUntil=previous.positionGuardUntil;
    const elapsed=previous.latestCommand.paused || previous.latestCommand.voting ? 0 : Math.max(0,(now-previous.checkpointAt)/1000);
    if (now>=state.positionGuardUntil || (Number.isFinite(video.currentTime) &&
        video.currentTime>=state.checkpoint-2 && video.currentTime<=state.checkpoint+elapsed+2)) {
      state.checkpoint=video.currentTime; state.checkpointAt=now;
    }
  }
  window.__fPlaybackWatch = state;
  const report = value => {
    // Recheck at emission time: a queued layout callback must never reveal an
    // ad or report its position after the player changes modes.
    const advertisement = isAdvertisement();
    if (advertisement) {
      const suppress = state.latestCommand?.suppressAdOutput === true;
      value = { status: state.latestCommand?.blockAdRequests ? 'Ad reached the player; filtering needs attention — queue position held' : suppress ? 'Advertisement hidden + muted — queue position held'
        : 'Advertisement — queue position held', displayReady: false, revealDisplay: !suppress };
    }
    document.title = 'fPlayback:' + command.nonce + ':' + JSON.stringify({
      generation: command.generation, videoId: command.videoId, href: location.href, sample: performance.now(),
      qualityRequested:state.qualityRequested, videoWidth:video?.videoWidth, videoHeight:video?.videoHeight, ...value, advertisement
    });
  };
  const player = document.querySelector('#movie_player');
  const promoSelector='ytd-mealbar-promo-renderer, yt-mealbar-promo-renderer, ytd-premium-upsell-renderer, ytd-premium-promo-renderer';
  const hardBarrierSelector='ytd-enforcement-message-view-model, .ytp-error-content-wrap, #error-screen:not([hidden])';
  const isPromotion=element=>{
    if(element.matches?.(hardBarrierSelector)||element.querySelector?.(hardBarrierSelector))return false;
    if(element.matches?.(promoSelector)||element.querySelector?.(promoSelector))return true;
    const text=element.textContent||'';
    return /YouTube\s+Premium/i.test(text)&&/No\s+thanks/i.test(text)&&
      /Get YouTube without (?:the )?ads|\b(?:1|one)\s+month\s+free\b/i.test(text);
  };
  const suppressPromotions=()=>{
    const locked=state.latestCommand?.locked===true;
    const saved=window.__fPlaybackPromos||(window.__fPlaybackPromos=new Map());
    for(const [element,styles] of saved){
      if(locked&&element.isConnected!==false)continue;
      for(const [name,value,priority] of styles){if(value)element.style.setProperty(name,value,priority);else element.style.removeProperty(name);}
      saved.delete(element);
    }
    let css=document.getElementById?.('fplayback-promotion-style');
    if(!css&&document.createElement){css=document.createElement('style');css.id='fplayback-promotion-style';(document.head||document.documentElement).appendChild(css);}
    const rules=locked?`:is(${promoSelector}):not(:has(${hardBarrierSelector})), tp-yt-paper-dialog:has(${promoSelector}):not(:has(${hardBarrierSelector})) { display:none!important; visibility:hidden!important; pointer-events:none!important; }`:'';
    if(css&&css.textContent!==rules)css.textContent=rules;
    if(!locked)return;
    for(const element of document.querySelectorAll(`${promoSelector}, tp-yt-paper-dialog, ytd-confirm-dialog-renderer`)){
      if(!isPromotion(element))continue;
      if(!saved.has(element))saved.set(element,['display','visibility','pointer-events'].map(name=>[name,element.style.getPropertyValue(name),element.style.getPropertyPriority(name)]));
      element.style.setProperty('display','none','important');element.style.setProperty('visibility','hidden','important');element.style.setProperty('pointer-events','none','important');
    }
  };
  const barrierElements = () => {
    suppressPromotions();
    const elements = document.querySelectorAll('ytd-enforcement-message-view-model, .ytp-error-content-wrap, #error-screen:not([hidden]), tp-yt-paper-dialog, ytd-confirm-dialog-renderer');
    return Array.from(elements).filter(element => element.getClientRects().length && element.textContent.trim());
  };
  const hasBarrier = () => barrierElements().length>0;
  const resetWatchdog = () => { state.progressAt = now; state.lastPosition = null; };
  const positionMatches = (position,sampleNow=now) => {
    if (!state.applied || sampleNow >= state.positionGuardUntil) return true;
    const elapsed=command.paused || command.voting ? 0 : Math.max(0,(sampleNow-state.checkpointAt)/1000);
    return position>=state.checkpoint-2 && position<=state.checkpoint+elapsed+2;
  };
  const recover = reason => report({status:'Recovering stalled YouTube playback…',recover:reason});
  state.latestCommand = command; state.report = report;
  // Observe only player mode changes, not the entire document. This also runs
  // between the one-second station polls. Native output gating is separate
  // from the fade timeout and provides the actual opaque OBS video mask.
  const matchingPage = () => window.__fPlaybackWatch === state &&
    location.origin === 'https://www.youtube.com' && location.pathname === '/watch' &&
    new URL(location.href).searchParams.get('v') === state.latestCommand.videoId;
  const guardAdvertisement = () => {
    if (!matchingPage()) return;
    if (!isAdvertisement()) {
      if (state.adActive) {
        state.adActive = false;
        state.layoutReady = false;
        state.checkLayout?.();
      }
      return;
    }
    state.adActive = true;
    state.applied = false;
    state.invalidateLayout?.();
    state.layoutReady = false;
    state.progressAt = performance.now(); state.lastPosition = null;
    if (state.latestCommand.suppressAdOutput === true && state.guardVideo) {
      state.adMuted = true;
      if (!state.guardVideo.muted) state.guardVideo.muted = true;
    } else if (state.adMuted && state.guardVideo) {
      state.adMuted = false;
      state.guardVideo.muted = state.latestCommand.muted;
      state.guardVideo.volume = state.latestCommand.volume / 100;
    }
    state.report({});
  };
  if (state.guardPlayer !== player || state.guardVideo !== video) {
    state.detachAdGuard?.();
    state.guardPlayer = player; state.guardVideo = video;
    const observer = player ? new MutationObserver(guardAdvertisement) : null;
    observer?.observe(player, { attributes: true, attributeFilter: ['class'], childList: true });
    // YouTube can reset mute during an ad pod; keep the browser itself quiet
    // too, without changing the user's saved station volume/mute settings.
    const volumeChanged = () => {
      if (matchingPage() && isAdvertisement() && state.latestCommand.suppressAdOutput === true && video && !video.muted)
        video.muted = true;
    };
    video?.addEventListener('volumechange', volumeChanged);
    state.detachAdGuard = () => {
      observer?.disconnect(); video?.removeEventListener('volumechange', volumeChanged);
      state.guardPlayer = null; state.guardVideo = null;
    };
  }
  const advertisement=isAdvertisement();
  const barriers=barrierElements();
  const barrier=barriers.length>0;
  const transientPlayerError=barrier && barriers.every(element=>
    element.matches?.('.ytp-error-content-wrap') &&
    /^An error occurred\.?\s+Please try again later\.?(?:\s|$)/i.test(element.textContent.trim()));
  // Lock only the ordinary player chrome. Access prompts and advertisements
  // retain their original UI. Interaction does not unlock the output size.
  const chrome=Array.from(document.querySelectorAll('.ytp-chrome-bottom, .ytp-chrome-top, .ytp-gradient-bottom, .ytp-gradient-top, .ytp-tooltip, .ytp-watermark, .branding-img-container, .iv-branding'));
  const saved=window.__fPlaybackChrome || (window.__fPlaybackChrome=new Map());
  const lockChrome=command.locked===true && command.interacting!==true && !advertisement && !barrier;
  for (const [element,styles] of saved) {
    if (lockChrome && chrome.includes(element)) continue;
    for (const [name,value,priority] of styles) {
      if (value) element.style.setProperty(name,value,priority);
      else element.style.removeProperty(name);
    }
    saved.delete(element);
  }
  if (lockChrome) for (const element of chrome) {
    if (!saved.has(element)) saved.set(element,['opacity','visibility','pointer-events'].map(name=>
      [name,element.style.getPropertyValue(name),element.style.getPropertyPriority(name)]));
    element.style.setProperty('opacity','0','important');
    element.style.setProperty('visibility','hidden','important');
    element.style.setProperty('pointer-events','none','important');
  }
  // Ads and access barriers must never advance or overwrite the saved queue position.
  if (advertisement) { state.transientErrorSince=null; guardAdvertisement(); return; }
  state.adActive = false;
  if (barrier) {
    state.applied=false; resetWatchdog();
    if(transientPlayerError && !command.paused && !command.voting){
      state.transientErrorSince ??= now;
      if(now-state.transientErrorSince>=30000){recover('player-error');return;}
      report({status:'YouTube playback error — retrying at the saved position shortly.',revealDisplay:true});return;
    }
    state.transientErrorSince=null;
    report({ status: 'YouTube needs attention. Open the output window to check access or confirm playback.', revealDisplay:true }); return;
  }
  state.transientErrorSince=null;
  if (!video || video.readyState < 1 || !Number.isFinite(video.duration) || video.duration <= 0) {
    if (command.paused || command.voting || state.autoplayBlocked) resetWatchdog();
    else if (now-state.progressAt >= 30000) { recover('startup'); return; }
    report({ status: 'Waiting for YouTube. Sign in or check video access in the output window.' }); return;
  }
  // This is the normal watch-page player, not the IFrame API (whose quality
  // setters are no-ops). Feature-detect its controls; YouTube can change them.
  // Prefer standard 1080p without assuming the order of the advertised levels.
  if (command.interacting !== true && now >= (state.qualityCheckAt ?? 0)) {
    state.qualityCheckAt = now + 5000;
    try {
      const levels = player?.getAvailableQualityLevels?.();
      const order = ['highres','hd2880','hd2160','hd1440','hd1080','hd720','large','medium','small','tiny'];
      const available = Array.isArray(levels) ? order.filter(level => levels.includes(level)) : [];
      const target = order.slice(4).find(level => available.includes(level)) || available[0];
      if (target) {
        const actual = player.getPlaybackQuality?.();
        if (target !== state.qualityRequested || actual !== target) {
          // Bound reassertion if adaptive playback drops quality. Never reload,
          // seek, or pause the video to change its stream representation.
          let requested = false;
          try { if (typeof player.setPlaybackQualityRange === 'function') { player.setPlaybackQualityRange(target,target); requested = true; } } catch {}
          try { if (typeof player.setPlaybackQuality === 'function') { player.setPlaybackQuality(target); requested = true; } } catch {}
          if (requested) state.qualityRequested = target;
        }
        state.qualityCheckAt = now + 15000;
      }
    } catch {} // A missing/changing quality API must not break queue playback.
  }
  if (state.video !== video) {
    state.detach?.(); state.video = video;
    state.checkLayout=null;state.invalidateLayout=null;state.layoutReady=false;
    if (!preservePosition) state.applied=false;
    const ended = () => {
      const latest = state.latestCommand;
      if (window.__fPlaybackWatch !== state || !state.applied || !state.played || latest.paused || latest.voting ||
          video.seeking || !positionMatches(video.currentTime,performance.now()) ||
          location.origin !== 'https://www.youtube.com' || location.pathname !== '/watch' ||
          new URL(location.href).searchParams.get('v') !== latest.videoId ||
          isAdvertisement() ||
          hasBarrier()) return;
      state.report({ status: 'Video ended', ended: true });
    };
    video.addEventListener('ended', ended);
    state.detach = () => video.removeEventListener('ended', ended);
  }
  // Crop the real watch player without an embed or synthetic confirmation clicks.
  const css = (element, styles) => {
    for (const [name,value] of Object.entries(styles)) element.style.setProperty(name,value,'important');
  };
  // CSSOM properties also work when the page's CSP rejects an injected <style>.
  const applyLayout=()=>{
    css(document.documentElement,{margin:'0',background:'#000',overflow:'hidden'});
    css(document.body,{margin:'0',background:'#000',overflow:'hidden'});
    if (player && player.parentElement !== document.body) document.body.appendChild(player);
    if (player) css(player,{position:'fixed',inset:'0',width:'100vw',height:'100vh',background:'#000','z-index':'2147483646'});
    css(video,{width:'100vw',height:'100vh',left:'0',top:'0','object-fit':'contain'});
  };
  applyLayout();
  if (!state.checkLayout) {
    let frame=null,stableSince=null;
    state.invalidateLayout=()=>{stableSince=null;state.layoutReady=false;};
    state.layoutReady=false;
    const fullSize=element=>{
      const rect=element?.getBoundingClientRect();
      return rect && Math.abs(rect.left)<=2 && Math.abs(rect.top)<=2 &&
        Math.abs(rect.width-window.innerWidth)<=2 && Math.abs(rect.height-window.innerHeight)<=2;
    };
    const check=()=>{
      frame=null;
      if (window.__fPlaybackWatch!==state || state.video!==video ||
          location.origin!=='https://www.youtube.com' || location.pathname!=='/watch' ||
          new URL(location.href).searchParams.get('v')!==state.latestCommand.videoId) return;
      if (isAdvertisement()) {
        state.layoutReady=false;stableSince=null;
        guardAdvertisement(); return;
      }
      if (hasBarrier()) {
        state.layoutReady=false;stableSince=null;
        state.report({status:'YouTube needs attention',revealDisplay:true});return;
      }
      const now=performance.now();
      const sized=fullSize(player) && fullSize(video);
      const ready=sized && video.readyState>=2 && video.videoWidth>0 && video.videoHeight>0 && !video.seeking && state.applied;
      if (!ready) {
        stableSince=null;
        if (state.layoutReady) state.report({status:'Preparing video layout…',displayReady:false});
        state.layoutReady=false;
        if (!sized) applyLayout();
      } else {
        if (stableSince===null) stableSince=now;
        if (now-stableSince>=500 && !state.layoutReady) {
          state.layoutReady=true;
          state.report({status:state.latestCommand.paused?'Paused':'Playing',displayReady:true});
        }
      }
      if (!state.layoutReady) frame=requestAnimationFrame(check);
    };
    state.checkLayout=()=>{if(frame===null)frame=requestAnimationFrame(check);};
    const observer=new MutationObserver(state.checkLayout);
    observer.observe(video,{attributes:true,attributeFilter:['style','class']});
    if(player)observer.observe(player,{attributes:true,attributeFilter:['style','class']});
    window.addEventListener?.('resize',state.checkLayout);
    const detach=state.detach;
    state.detach=()=>{detach?.();observer.disconnect();if(frame!==null)cancelAnimationFrame(frame);window.removeEventListener?.('resize',state.checkLayout);};
  }
  state.checkLayout();
  if (command.paused || command.voting) video.pause();
  if (!state.applied) {
    state.checkpoint = Math.max(0, Math.min(command.position, video.duration));
    state.checkpointAt=now; state.positionGuardUntil=now+10000;
    video.currentTime = state.checkpoint;
    state.applied = true;
  }
  // YouTube can apply account watch-history resume after our initial seek.
  // Reject that jump before it can replace Playback's saved queue checkpoint.
  if (!positionMatches(video.currentTime)) {
    video.currentTime=state.checkpoint;
    state.checkpointAt=now;
    report({status:'Restoring Playback saved position…'}); return;
  }
  if (video.seeking) {
    if (now-state.progressAt>=30000) recover('startup');
    else report({status:'Restoring Playback saved position…'});
    return;
  }
  state.checkpoint=video.currentTime; state.checkpointAt=now;
  video.volume = command.volume / 100;
  video.muted = command.muted;
  state.adMuted = false;
  if (command.paused || command.voting) {
    video.pause();
  } else if (video.paused && !video.ended) {
    const attempt = video.play();
    attempt?.catch(error => {
      if (window.__fPlaybackWatch !== state) return;
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        state.autoplayBlocked = true;
        report({ status: 'Press Play in the output window to allow playback.' });
      }
    });
  }
  if (!video.paused && !video.ended) { state.played = true; state.autoplayBlocked = false; }
  if (video.ended && state.played && !command.paused && !command.voting) {
    report({ status: 'Video ended', ended: true }); return;
  }
  if (command.paused || command.voting || state.autoplayBlocked) {
    resetWatchdog();
  } else if (Number.isFinite(video.currentTime)) {
    if (state.lastPosition === null || Math.abs(video.currentTime-state.lastPosition) >= .25) {
      state.lastPosition = video.currentTime; state.progressAt = now;
    } else if (now-state.progressAt >= 10000) {
      recover(video.readyState < 3 ? 'buffering' : 'stalled'); return;
    }
  }
  if (state.autoplayBlocked) { report({status:'Press Play in the output window to allow playback.'}); return; }
  // Voting must not undo the engine's parked playback position.
  if (command.voting || !state.applied || !Number.isFinite(video.currentTime)) {
    report({ status: command.voting ? 'Waiting for the queue vote' : 'Waiting for playback' }); return;
  }
  report({ status: command.paused ? 'Paused' : 'Playing', position: video.currentTime, duration: video.duration,
    displayReady:state.layoutReady===true && video.readyState>=2 && !video.seeking });
})();
