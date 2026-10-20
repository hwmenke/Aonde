// Lista local de roteiros e ofertas. Guarda só tipo + id e a versão do
// formato. O texto da página é resolvido de novo no catálogo atual; um id
// que saiu do site continua citado, sem ser trocado por outro.

import { GUIDE_LIST, GUIDES, OFFERS } from "./aondeContent.js";

export const SALVOS_CHAVE = "aonde-salvos";

function texto(valor) {
  return typeof valor === "string" && valor.trim() ? valor.trim() : "";
}

export function catalogoSalvos() {
  const itens = [];
  for (const resumo of GUIDE_LIST) {
    const g = GUIDES[resumo.id] || resumo;
    const dias = Array.isArray(g.dias) ? g.dias.length : 0;
    itens.push({
      tipo: "guia",
      id: resumo.id,
      titulo: texto(g.titulo) || resumo.id,
      href: `/guias/${encodeURIComponent(resumo.id)}`,
      duracao: dias ? `${dias} dias` : "",
      epoca: texto(g.tag),
      origem: "",
      itinerario: texto(g.breadcrumb),
    });
  }
  for (const o of OFFERS) {
    if (!o || !o.id) continue;
    itens.push({
      tipo: "oferta",
      id: o.id,
      titulo: texto(o.cidade) || texto(o.destino) || o.id,
      href: `/ofertas/${encodeURIComponent(o.id)}`,
      duracao: texto(o.datas),
      epoca: texto(o.tipo),
      origem: texto(o.origem),
      itinerario: texto(o.ida) ? `ida ${o.ida}${o.volta ? `, volta ${o.volta}` : ""}` : "",
    });
  }
  return itens;
}

export function scriptSalvos() {
  return `(function(){
  var CHAVE=${JSON.stringify(SALVOS_CHAVE)};
  function vazio(){return {v:1,ids:[]};}
  function ler(){
    try{
      var bruto=localStorage.getItem(CHAVE);
      if(!bruto)return vazio();
      var dado=JSON.parse(bruto);
      if(!dado||dado.v!==1||!Array.isArray(dado.ids))return vazio();
      var ids=[];
      for(var i=0;i<dado.ids.length;i++){
        var item=dado.ids[i];
        if(!item||(item.tipo!=='guia'&&item.tipo!=='oferta'))continue;
        if(typeof item.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(item.id))continue;
        ids.push({tipo:item.tipo,id:item.id});
      }
      return {v:1,ids:ids};
    }catch(e){
      return false;
    }
  }
  function gravar(dado){
    localStorage.setItem(CHAVE,JSON.stringify({v:1,ids:dado.ids}));
  }
  function falar(msg){
    var el=document.querySelector('[data-salvar-status]');
    if(el)el.textContent=msg;
  }
  function tem(dado,tipo,id){
    if(!dado)return false;
    for(var i=0;i<dado.ids.length;i++){
      if(dado.ids[i].tipo===tipo&&dado.ids[i].id===id)return true;
    }
    return false;
  }
  function pintar(){
    var dado=ler();
    document.querySelectorAll('[data-salvar]').forEach(function(btn){
      var on=!!(dado&&tem(dado,btn.getAttribute('data-tipo'),btn.getAttribute('data-id')));
      btn.setAttribute('aria-pressed',on?'true':'false');
      btn.textContent=on?'Salvo':'Salvar';
    });
    return dado;
  }
  document.querySelectorAll('[data-salvar]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var tipo=btn.getAttribute('data-tipo');
      var id=btn.getAttribute('data-id');
      var dado=ler();
      if(!dado){falar('Não foi possível usar a memória deste navegador. Nada foi salvo.');return;}
      if(tem(dado,tipo,id)){
        dado.ids=dado.ids.filter(function(item){return !(item.tipo===tipo&&item.id===id);});
        try{gravar(dado);falar('Removido dos salvos.');}catch(e){falar('Não foi possível usar a memória deste navegador. Nada foi salvo.');return;}
      }else{
        dado.ids.push({tipo:tipo,id:id});
        try{gravar(dado);falar('Salvo neste navegador.');}catch(e){falar('Não foi possível usar a memória deste navegador. Nada foi salvo.');return;}
      }
      pintar();
      desenhar();
    });
  });
  function catalogo(){
    var el=document.getElementById('salvos-catalogo');
    if(!el)return [];
    try{var lista=JSON.parse(el.textContent||'[]');return Array.isArray(lista)?lista:[];}
    catch(e){return [];}
  }
  function esc(s){if(!s&&s!==0)s='';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function campo(valor){return valor?esc(valor):'não informado';}
  function desenhar(){
    var raiz=document.querySelector('[data-salvos-lista]');
    if(!raiz)return;
    var dado=ler();
    var comp=document.querySelector('[data-salvos-comparar]');
    if(!dado){raiz.textContent='Não foi possível ler os itens salvos neste navegador.';if(comp)comp.textContent='';return;}
    if(!dado.ids.length){raiz.textContent='Nenhum roteiro ou oferta salvo ainda.';if(comp)comp.textContent='';return;}
    var cat=catalogo();
    function achar(item){
      for(var i=0;i<cat.length;i++){
        if(cat[i].tipo===item.tipo&&cat[i].id===item.id)return cat[i];
      }
      return false;
    }
    var html='';
    var linhas=[];
    for(var i=0;i<dado.ids.length;i++){
      var item=dado.ids[i];
      var atual=achar(item);
      if(!atual){
        html+='<article class="salvo-item"><h2>'+esc(item.tipo)+' '+esc(item.id)+'</h2><p>Este item salvo não está mais disponível.</p>'+
          '<button type="button" data-salvar data-tipo="'+esc(item.tipo)+'" data-id="'+esc(item.id)+'" aria-pressed="true">Remover dos salvos</button></article>';
        continue;
      }
      html+='<article class="salvo-item"><h2><a href="'+esc(atual.href)+'">'+esc(atual.titulo)+'</a></h2>'+
        '<p>Duração: '+campo(atual.duracao)+'</p>'+
        '<p>Época: '+campo(atual.epoca)+'</p>'+
        '<p>Origem: '+campo(atual.origem)+'</p>'+
        '<p>Roteiro: '+campo(atual.itinerario)+'</p>'+
        '<button type="button" data-salvar data-tipo="'+esc(atual.tipo)+'" data-id="'+esc(atual.id)+'" aria-pressed="true">Salvo</button></article>';
      linhas.push(atual);
    }
    raiz.innerHTML=html;
    raiz.querySelectorAll('[data-salvar]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var dado2=ler();
        if(!dado2){falar('Não foi possível usar a memória deste navegador. Nada foi salvo.');return;}
        var tipo=btn.getAttribute('data-tipo');
        var id=btn.getAttribute('data-id');
        dado2.ids=dado2.ids.filter(function(it){return !(it.tipo===tipo&&it.id===id);});
        try{gravar(dado2);}catch(e){falar('Não foi possível usar a memória deste navegador. Nada foi salvo.');return;}
        falar('Removido dos salvos.');
        pintar();
        desenhar();
      });
    });
    if(!comp)return;
    if(linhas.length<2){comp.textContent='Salve pelo menos dois itens que ainda existem no site para comparar.';return;}
    var tabela='<table class="salvos-tabela"><thead><tr><th>Item</th><th>Duração</th><th>Época</th><th>Origem</th><th>Roteiro</th></tr></thead><tbody>';
    for(var j=0;j<linhas.length;j++){
      var l=linhas[j];
      tabela+='<tr><th scope="row"><a href="'+esc(l.href)+'">'+esc(l.titulo)+'</a></th><td>'+campo(l.duracao)+'</td><td>'+campo(l.epoca)+'</td><td>'+campo(l.origem)+'</td><td>'+campo(l.itinerario)+'</td></tr>';
    }
    tabela+='</tbody></table>';
    comp.innerHTML=tabela;
  }
  var inicial=pintar();
  if(inicial===false)falar('Não foi possível ler os itens salvos neste navegador.');
  desenhar();
})();`;
}
