try {
  const board=decodeURIComponent(location.hash.slice(1));
  if(!/^https:\/\/www\.pinterest\.com\/[^/?#]+\/[^/?#]+\/$/.test(board))throw new Error('No valid board linked.');
  const link=document.createElement('a');link.href=board;link.textContent='View our Pinterest board';
  link.dataset.pinDo='embedBoard';link.dataset.pinScaleHeight='500';link.dataset.pinScaleWidth='100';
  document.querySelector('#board').replaceChildren(link);
  const script=document.createElement('script');script.src='https://assets.pinterest.com/js/pinit.js';script.async=true;script.defer=true;
  script.onerror=()=>{link.textContent='Pinterest preview could not load. Open the board using the link below the preview.';};
  document.body.append(script);
} catch {document.querySelector('#board').textContent='Use a full public Pinterest board link in the planner.';}
