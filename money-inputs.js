(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SlinkMoneyFields=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const names=new Set(['price','cost','packCostVnd','unitCostVnd','amount','amountVnd','amountReceivedVnd','paid','openingFloatVnd','countedCashVnd','openingBalanceVnd','openingPayableVnd','discount','discountVnd','minimumSubtotalVnd','maximumDiscountVnd']);
  const raw=value=>{const text=String(value??'').trim();return /^\d+(?:[.,]\d{3})*$/.test(text)?text.replace(/[.,]/g,'').replace(/^0+(?=\d)/,''):text;};
  const format=value=>{const text=raw(value);return /^\d+$/.test(text)?text.replace(/\B(?=(\d{3})+(?!\d))/g,'.'):text;};
  function enhance(container){
    container.querySelectorAll('input').forEach(input=>{
      if(input.dataset.money==='true'){if(document.activeElement!==input)input.value=format(input.value);return;}
      if(!(names.has(input.name)||input.matches('[data-tender-amount],[data-variant-price],[data-variant-cost],[data-channel-order-price],[data-order-cost],[data-purchase-cost]'))||input.type==='hidden')return;
      input.dataset.money='true';input.type='text';input.inputMode='numeric';input.pattern='[0-9]+(?:\\.[0-9]{3})*';
      input.maxLength=25;
      input.value=format(input.value);
      const box=document.createElement('span');box.className='money-shortcut';
      const button=document.createElement('button');button.type='button';button.className='link-button';button.textContent='+000';button.setAttribute('aria-label','Thêm ba số không vào số tiền');
      button.disabled=input.disabled||input.readOnly;
      box.append(button);const wrapper=document.createElement('span');wrapper.className='money-control';input.before(wrapper);wrapper.append(input,box);
      const update=()=>{
        if(input.dataset.composing==='true')return;
        const start=input.selectionStart??input.value.length,digits=input.value.slice(0,start).replace(/\D/g,'').length;
        const next=format(input.value);input.value=next;
        let index=0,count=0;while(index<next.length&&count<digits){if(/\d/.test(next[index]))count++;index++;}
        input.setSelectionRange(index,index);
      };
      input.addEventListener('input',update);
      input.addEventListener('blur',update);
      input.addEventListener('keydown',event=>{
        if(event.ctrlKey||event.metaKey||event.altKey||input.selectionStart!==input.selectionEnd)return;
        const at=input.selectionStart,value=input.value;
        if(event.key==='Backspace'&&at>1&&value[at-1]==='.'){
          event.preventDefault();input.value=value.slice(0,at-2)+value.slice(at);input.setSelectionRange(at-2,at-2);input.dispatchEvent(new Event('input',{bubbles:true}));
        }else if(event.key==='Delete'&&value[at]==='.'){
          event.preventDefault();input.value=value.slice(0,at)+value.slice(at+2);input.setSelectionRange(at,at);input.dispatchEvent(new Event('input',{bubbles:true}));
        }
      });
      input.addEventListener('compositionstart',()=>input.dataset.composing='true');
      input.addEventListener('compositionend',()=>{delete input.dataset.composing;update();});
      button.addEventListener('pointerdown',event=>event.preventDefault());
      button.addEventListener('click',()=>{
        const value=raw(input.value)||'0';if(!/^\d+$/.test(value)||BigInt(value+'000')>9007199254740991n)return;
        input.value=format(value+'000');input.focus();input.setSelectionRange(input.value.length,input.value.length);
        input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
      });
    });
    container.querySelectorAll('form').forEach(form=>{
      if(form.dataset.moneyReady)return;form.dataset.moneyReady='true';
      form.addEventListener('formdata',event=>{
        const fields=new Map();
        form.querySelectorAll('input[data-money="true"][name]:not(:disabled)').forEach(input=>{const group=fields.get(input.name)||[];group.push(raw(input.value));fields.set(input.name,group);});
        for(const [name,values] of fields){event.formData.delete(name);values.forEach(value=>event.formData.append(name,value));}
      });
    });
  }
  if(typeof document!=='undefined'){
    let scheduled=0;const pending=new Set();
    for(const type of ['input','change','click'])document.addEventListener(type,event=>{
      const container=event.target.closest?.('.modal,form');if(!container)return;pending.add(container);
      if(!scheduled)scheduled=requestAnimationFrame(()=>{scheduled=0;for(const item of pending)if(item.isConnected)enhance(item);pending.clear();});
    });
  }
  return {raw,format,enhance};
});
