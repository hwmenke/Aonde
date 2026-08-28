// ---------------------------------------------------------------------------
// FOLHA DE ESTILO DO SITE.
//
// Morava dentro de htmlRenderer.js e respondia por 840 das ~3.980 linhas do
// arquivo — 21% de um modulo que ja era o gargalo de toda mudanca de interface.
// Nas rodadas de agentes, tudo que mexia em tela precisou rodar em serie por
// causa dele. Sair daqui e o primeiro passo, e o de menor risco: e uma string,
// nao tem logica, e o unico consumidor e pageStylesCss().
//
// A memoizacao continua: a string e montada uma vez por processo. O servidor
// serve isto como asset com hash no nome e Cache-Control imutavel.
// ---------------------------------------------------------------------------

let _pageStylesCache = null;
export function pageStyles() {
  if (_pageStylesCache !== null) return _pageStylesCache;
  _pageStylesCache = `
  :root{
    /* Cinzas escurecidos de proposito: dao folga de contraste para o cenario
       das estacoes aparecer no fundo sem derrubar a legibilidade (AA). */
    --bg:#f7f7f5;--text:#18181b;--muted:#4f4f48;--muted-2:#50504a;
    --border:#e7e7e3;--border-2:#c9c9c2;--tint:#f1f8e4;--tint-border:#d9edb8;--dark:#18181b;
    --green:#4d7c0f;--green-2:#3f6212;--lime:#84cc16;--lime-2:#a3e635;--on-green:#fff;
    --erro-bg:#fde3cf;--erro-text:#9a3412;
    /* Superficies (cartoes/inputs) e o par "inverso" (chip solido de maximo
       contraste, usado em botao escuro/estado ativo) — em modo claro e
       quase-preto sobre quase-branco; em escuro, invertemos os dois. */
    --surface:#fff;--input-bg:#fbfbfa;--bg-rgb:247,247,245;
    --invert-bg:#18181b;--invert-bg-hover:#2d2d29;--invert-text:#fff;
    /* Veu do fundo 3D das estacoes: cor + 3 paradas de opacidade, separadas
       para poder escurecer mais no tema escuro sem mudar o desenho do gradiente. */
    --veil-rgb:247,247,245;--veil-a1:.30;--veil-a2:.44;--veil-a3:.36;
    /* Tratamento de risco (erro de tarifa) — paleta laranja/marrom, deliberadamente
       fora do verde/lime da marca para não parecer "mais uma promoção". */
    --risk-bg:#fff7ed;--risk-border:#fed7aa;--risk-note-bg:#ffedd5;--risk-text:#9a3412;--risk-line:#f97316;
    --serif:"Instrument Serif",Georgia,"Times New Roman",serif;
    --sans:"Archivo",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
    --maxw:1200px;--r:16px;--r-lg:20px;--pill:999px;
  }
  /* --- Tema escuro ---------------------------------------------------------
     1) @media respeita a preferencia do sistema (prefers-color-scheme) quando
        a pessoa nunca escolheu nada no site.
     2) [data-tema="escuro"|"claro"] e a escolha manual (botao no cabecalho,
        persistida em localStorage) — como o seletor de atributo tem mais
        especificidade que o ":root" sozinho do bloco @media, a escolha manual
        sempre vence, em qualquer sentido, sem precisar de :not(). */
  @media (prefers-color-scheme:dark){
    :root{
      --bg:#131315;--text:#f2f2ef;--muted:#b9b9b0;--muted-2:#c9c9c0;
      --border:#303034;--border-2:#46464b;--tint:#16210c;--tint-border:#2f4a1a;
      --green:#84cc16;--green-2:#a3e635;--on-green:#18181b;
      --erro-bg:#fde3cf;--erro-text:#9a3412;
      --surface:#1c1c1f;--input-bg:#232326;--bg-rgb:19,19,21;
      --invert-bg:#f2f2ef;--invert-bg-hover:#e2e2dc;--invert-text:#18181b;
      --veil-rgb:10,10,9;--veil-a1:.55;--veil-a2:.70;--veil-a3:.62;
      --risk-bg:#2a1608;--risk-border:#7c3a12;--risk-note-bg:#341507;--risk-text:#ffd9b3;--risk-line:#fb923c;
    }
  }
  :root[data-tema="escuro"]{
    --bg:#131315;--text:#f2f2ef;--muted:#b9b9b0;--muted-2:#c9c9c0;
    --border:#303034;--border-2:#46464b;--tint:#16210c;--tint-border:#2f4a1a;
    --green:#84cc16;--green-2:#a3e635;--on-green:#18181b;
    /* Estavam so no bloco do @media: quem escolhia escuro NO BOTAO ficava com
       o selo de "Erro de tarifa" nas cores do tema claro. Os dois caminhos
       para o escuro tem de dar exatamente no mesmo lugar. */
    --erro-bg:#fde3cf;--erro-text:#9a3412;
    --surface:#1c1c1f;--input-bg:#232326;--bg-rgb:19,19,21;
    --invert-bg:#f2f2ef;--invert-bg-hover:#e2e2dc;--invert-text:#18181b;
    --veil-rgb:10,10,9;--veil-a1:.55;--veil-a2:.70;--veil-a3:.62;
    --risk-bg:#2a1608;--risk-border:#7c3a12;--risk-note-bg:#341507;--risk-text:#ffd9b3;--risk-line:#fb923c;
  }
  :root[data-tema="claro"]{
    --bg:#f7f7f5;--text:#18181b;--muted:#4f4f48;--muted-2:#50504a;
    --border:#e7e7e3;--border-2:#c9c9c2;--tint:#f1f8e4;--tint-border:#d9edb8;
    --green:#4d7c0f;--green-2:#3f6212;--on-green:#fff;
    --surface:#fff;--input-bg:#fbfbfa;--bg-rgb:247,247,245;
    --invert-bg:#18181b;--invert-bg-hover:#2d2d29;--invert-text:#fff;
    --veil-rgb:247,247,245;--veil-a1:.30;--veil-a2:.44;--veil-a3:.36;
    --risk-bg:#fff7ed;--risk-border:#fed7aa;--risk-note-bg:#ffedd5;--risk-text:#9a3412;--risk-line:#f97316;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{background:var(--bg);color:var(--text);font-family:var(--sans);line-height:1.55;-webkit-font-smoothing:antialiased;transition:background-color .15s,color .15s;}
  h1,h2,h3{font-family:var(--serif);font-weight:400;line-height:1.08;margin:0;letter-spacing:-.5px;}
  a{color:var(--green);text-decoration:none;}
  a:hover{color:var(--green-2);}
  a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible,[tabindex]:focus-visible{outline:3px solid var(--lime);outline-offset:2px;border-radius:4px;}
  @media (prefers-reduced-motion:reduce){*{animation-duration:.001ms!important;transition-duration:.001ms!important;}}
  img{max-width:100%;display:block;}
  .wrap{max-width:var(--maxw);margin:0 auto;padding:0 32px;}
  .media-img{width:100%;height:100%;object-fit:cover;}
  .media-placeholder{width:100%;height:100%;}
  .media-placeholder svg{width:100%;height:100%;display:block;}
  .media-credit-overlay{position:absolute;top:10px;right:12px;background:rgba(24,24,27,.55);color:#fff;font-size:11px;padding:3px 9px;border-radius:var(--pill);}
  .media-credit-overlay a{color:#fff;text-decoration:underline;}
  .eyebrow{margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;}
  .eyebrow--green{color:var(--green);}
  .eyebrow--lime{color:var(--lime-2);}
  .section{padding:72px 32px 0;}
  .section-sub{margin:12px 0 0;font-size:17px;color:var(--muted);max-width:56ch;}
  .section-title-wide{font-size:clamp(30px,4.5vw,44px);max-width:600px;line-height:1.08;margin-bottom:8px;}
  .section-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;}
  .section-head h2{font-size:40px;}
  .section-head p{margin:10px 0 0;font-size:16px;color:var(--muted);}
  .section-head--tight{margin-bottom:24px;}
  .section-link{font-size:15px;font-weight:600;}
  .breadcrumb{margin:0 0 20px;font-size:14px;color:var(--muted-2);}
  .breadcrumb span{color:var(--muted);}

  .btn{display:inline-block;border:none;border-radius:12px;padding:13px 22px;font-family:var(--sans);font-size:15px;font-weight:700;cursor:pointer;text-align:center;transition:background .15s,border-color .15s;}
  .btn-green{background:var(--green);color:var(--on-green);}
  .btn-green:hover{background:var(--green-2);color:#fff;}
  .btn-lime{background:var(--lime-2);color:#18181b;}
  .btn-lime:hover{background:#bef264;color:#18181b;}
  .btn-dark{background:#18181b;color:#fff;border-radius:var(--pill);padding:10px 20px;font-size:14px;font-weight:600;}
  .btn-dark:hover{background:#2d2d29;color:#fff;}
  .btn-ghost{background:transparent;color:#f7f7f5;border:1px solid #3f3f42;}
  .btn-ghost:hover{border-color:var(--lime-2);color:#f7f7f5;}

  /* ---- Cenario 3D das estacoes (fundo fixo de toda a pagina) ----
     Fica atras do conteudo; o conteudo sobe para z-index 1. O veu por cima
     garante que o texto continue legivel sobre qualquer estacao. */
  .seasons3d{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;}
  main,.site-footer{position:relative;z-index:1;}
  .s3-season{position:absolute;inset:0;opacity:0;
    /* a perspectiva mora AQUI: opacity<1 achataria um preserve-3d de fora */
    perspective:900px;
    animation:s3Fade 72s linear infinite both;}
  .s3-stage{position:absolute;inset:0;transform-style:preserve-3d;
    animation:s3Sway 46s ease-in-out infinite alternate;}
  .s3-orb{position:absolute;border-radius:50%;}
  .s3-sun{position:absolute;border-radius:50%;transform:translate(-50%,-50%);}
  .s3-horizon{position:absolute;left:0;right:0;bottom:0;height:38%;}
  @keyframes s3Fade{
    0%,18%{opacity:1;}
    25%,93%{opacity:0;}
    100%{opacity:1;}
  }
  @keyframes s3Sway{
    from{transform:rotateY(-5deg) rotateX(1.5deg) translateZ(0);}
    to{transform:rotateY(5deg) rotateX(-1.5deg) translateZ(40px);}
  }
  .s3-motes{position:absolute;inset:0;}
  .s3-mote{position:absolute;bottom:-8px;border-radius:50%;background:rgba(255,255,255,.85);
    box-shadow:0 0 6px 1px rgba(255,255,255,.5);opacity:0;
    animation-name:s3Rise;animation-timing-function:linear;animation-iteration-count:infinite;}
  @keyframes s3Rise{
    0%{transform:translateY(0) translateX(0);opacity:0;}
    12%{opacity:.75;}
    88%{opacity:.55;}
    100%{transform:translateY(-102vh) translateX(26px);opacity:0;}
  }
  /* Veu de legibilidade: sem ele o texto cinza claro brigaria com a cena. */
  .s3-veil{position:absolute;inset:0;
    background:linear-gradient(180deg,rgba(var(--veil-rgb),var(--veil-a1)) 0%,rgba(var(--veil-rgb),var(--veil-a2)) 42%,rgba(var(--veil-rgb),var(--veil-a3)) 100%);}
  @media (prefers-reduced-motion:reduce){
    /* Nada se move: fica so a estacao atual, parada. */
    .s3-season{animation:none;}
    .s3-season:first-child{opacity:1;}
    .s3-stage{animation:none;}
    .s3-motes{display:none;}
  }

  /* Pular para o conteudo: invisivel ate receber foco pelo teclado. Evita
     percorrer as ~8 paradas do cabecalho em CADA pagina. */
  .skip-link{position:absolute;left:12px;top:-100px;z-index:100;background:#365314;color:#fff;
    padding:12px 20px;border-radius:0 0 12px 12px;font-weight:700;font-size:15px;transition:top .15s;}
  .skip-link:focus{top:0;color:#fff;}
  main:focus{outline:none;}

  /* Controle de pausa do carrossel do hero (WCAG 2.2.2) */
  .hero-pause{align-self:center;background:rgba(24,24,27,.55);color:#f7f7f5;border:1px solid rgba(247,247,245,.35);
    border-radius:var(--pill);padding:6px 14px;font-family:var(--sans);font-size:12px;font-weight:600;
    cursor:pointer;margin-left:8px;transition:background .15s;}
  .hero-pause:hover{background:rgba(24,24,27,.8);}

  /* Header */
  .site-header{position:sticky;top:0;z-index:50;background:rgba(var(--bg-rgb),.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);}
  .site-header-in{height:68px;display:flex;align-items:center;justify-content:space-between;gap:24px;}
  /* --brand-fly = distancia do "a" ate o CENTRO do ponto lime (medida no
     navegador: centro do ponto a 76px da borda esquerda da marca, menos os
     7px de meio-aviao e o -1px de offset inicial). */
  .brand{display:flex;align-items:baseline;gap:3px;color:var(--text);position:relative;--brand-fly:70px;}
  .brand:hover{color:var(--text);}
  .brand-word{font-family:var(--serif);font-size:30px;letter-spacing:-.5px;}
  .brand-dot{width:8px;height:8px;border-radius:50%;background:var(--lime);display:inline-block;transform:translateY(-2px);
    animation:brandLand .9s ease-out 2.5s 1 both;}
  /* Aviao da marca: decola no "a", pousa no ponto depois do "e". */
  .brand-plane{position:absolute;left:-1px;top:50%;width:14px;height:14px;margin-top:-13px;
    color:var(--green);opacity:0;pointer-events:none;
    animation:brandFly 2.7s cubic-bezier(.38,.02,.28,1) .3s 1 both;}
  .brand-plane svg{display:block;width:100%;height:100%;fill:currentColor;}
  @keyframes brandFly{
    0%{opacity:0;transform:translate(0,7px) rotate(-16deg) scale(.65);}
    14%{opacity:1;}
    62%{transform:translate(calc(var(--brand-fly) * .66),-8px) rotate(-5deg) scale(1);}
    88%{opacity:1;transform:translate(var(--brand-fly),-2px) rotate(0deg) scale(.85);}
    100%{opacity:0;transform:translate(var(--brand-fly),-2px) rotate(0deg) scale(.75);}
  }
  @keyframes brandLand{
    0%,55%{transform:translateY(-2px) scale(1);box-shadow:0 0 0 0 rgba(132,204,22,0);}
    72%{transform:translateY(-2px) scale(1.6);box-shadow:0 0 0 5px rgba(132,204,22,.22);}
    100%{transform:translateY(-2px) scale(1);box-shadow:0 0 0 0 rgba(132,204,22,0);}
  }
  @media (prefers-reduced-motion:reduce){
    .brand-plane{display:none;}
    .brand-dot{animation:none;}
  }
  .site-nav{display:flex;gap:28px;font-size:15px;font-weight:500;}
  .site-nav a{color:var(--muted);display:flex;align-items:center;gap:6px;}
  .site-nav a:hover{color:#18181b;}
  .nav-pill{background:var(--lime);color:#18181b;font-size:10px;font-weight:700;letter-spacing:.04em;padding:2px 6px;border-radius:var(--pill);}
  .nav-ext{font-size:12px;opacity:.6;}
  .site-header-right{display:flex;align-items:center;gap:20px;}
  .tema-toggle{display:inline-flex;align-items:center;gap:7px;appearance:none;cursor:pointer;
    border:1px solid var(--border-2);background:var(--surface);color:var(--text);
    font-family:var(--sans);font-size:13px;font-weight:600;padding:8px 14px;border-radius:var(--pill);
    transition:background .15s,border-color .15s;}
  .tema-toggle:hover{border-color:var(--green);background:var(--tint);}
  .tema-toggle-ico{font-size:14px;line-height:1;}
  .site-atend{display:flex;flex-direction:column;align-items:flex-end;line-height:1.25;}
  .site-atend span{font-size:11px;color:var(--muted-2);letter-spacing:.04em;text-transform:uppercase;}
  .site-atend strong{font-size:14px;font-weight:600;}

  /* Hero */
  .hero{position:relative;height:620px;overflow:hidden;background:#18181b;}
  .hero-bgs{position:absolute;inset:0;}
  .hero-bg{position:absolute;inset:0;opacity:0;transition:opacity 1.2s ease;}
  .hero-bg.is-active{opacity:1;}
  .hero-scrim{position:absolute;inset:0;background:linear-gradient(90deg,rgba(24,24,27,.82) 0%,rgba(24,24,27,.55) 40%,rgba(24,24,27,.15) 100%);}
  .hero-in{position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;}
  .hero-title{font-size:clamp(40px,7vw,76px);color:#fbfbfa;max-width:760px;line-height:1;text-shadow:0 2px 30px rgba(0,0,0,.35);}
  .hero-title em{font-style:italic;}
  .hero-sub{margin:22px 0 0;font-size:19px;color:#e7e7e3;max-width:520px;line-height:1.5;}
  .hero-tabs{display:flex;gap:20px;margin-top:32px;}
  .hero-tab{background:transparent;border:none;padding:0;cursor:pointer;display:flex;flex-direction:column;gap:8px;opacity:.5;transition:opacity .3s;}
  .hero-tab.is-active{opacity:1;}
  .hero-tab span:first-child{font-size:14px;font-weight:600;color:#fbfbfa;}
  .hero-bar{width:40%;height:3px;border-radius:2px;background:var(--lime-2);transition:width .4s;}
  .hero-tab.is-active .hero-bar{width:100%;}
  .hero-legenda{position:absolute;bottom:20px;right:32px;background:rgba(24,24,27,.6);backdrop-filter:blur(8px);color:#f7f7f5;border-radius:12px;padding:9px 15px;font-size:13px;font-weight:600;}

  /* Search card */
  .search-wrap{margin-top:-52px;position:relative;z-index:10;padding-bottom:24px;}
  .search-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:0 24px 48px -32px rgba(24,24,27,.25);overflow:hidden;}
  .sc-tabs{display:flex;gap:4px;padding:12px 16px 0;border-bottom:1px solid var(--border);}
  .sc-tab{font-size:14px;font-weight:600;color:var(--muted);padding:10px 18px;border-radius:10px 10px 0 0;border-bottom:2px solid transparent;}
  .sc-tab.is-active{background:var(--tint);color:var(--green-2);border-bottom-color:var(--green);}
  .sc-tab--soon{opacity:.45;cursor:not-allowed;}
  .sc-tab--soon::after{content:" · em breve";font-size:11px;font-weight:400;}
  /* Aviso "como funciona por aqui": tom informativo (verde da marca, nao
     laranja/vermelho de alerta) com um icone circular no lugar de comecar a
     frase com uma negativa — a mesma informacao, com menos susto. */
  .sc-notice{margin:14px 20px 0;background:var(--tint);border:1px solid var(--tint-border);border-radius:12px;padding:12px 16px 12px 44px;position:relative;font-size:14px;line-height:1.5;color:var(--green-2);}
  .sc-notice::before{content:"i";position:absolute;left:16px;top:13px;width:20px;height:20px;border-radius:50%;background:var(--green);color:#fff;font-family:Georgia,serif;font-style:italic;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;line-height:1;}
  .sc-notice-tag{font-weight:700;}
  .sc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));gap:12px;padding:20px;align-items:end;}
  .sc-field{display:flex;flex-direction:column;gap:6px;}
  .sc-field span{font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted-2);}
  .sc-field input{border:1px solid var(--border-2);border-radius:12px;padding:13px 14px;font-family:var(--sans);font-size:15px;background:var(--input-bg);color:#18181b;}
  .sc-submit{min-width:150px;white-space:nowrap;}
  .sc-field--num{min-width:0;}
  .sc-field select{border:1px solid var(--border-2);border-radius:12px;padding:13px 14px;
    font-family:var(--sans);font-size:15px;background:var(--input-bg);color:#18181b;width:100%;}
  .sc-hint{font-size:11px;color:var(--muted-2);line-height:1.3;}
  .search-perks{display:flex;gap:28px;padding:18px 8px 0;font-size:14px;color:var(--muted);flex-wrap:wrap;}
  .search-perks span{display:flex;align-items:center;gap:8px;}
  .search-perks i{width:6px;height:6px;border-radius:50%;background:var(--lime);}

  /* Offer cards */
  .of-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:20px;margin-top:28px;}
  .of-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column;color:inherit;transition:box-shadow .2s,transform .2s;}
  .of-card:hover{box-shadow:0 16px 32px -24px rgba(24,24,27,.35);transform:translateY(-2px);color:inherit;}
  .of-card--erro{border-color:#f3c6a8;}
  .of-media{position:relative;height:160px;}
  .of-media-inner{width:100%;height:100%;}
  .of-badge{position:absolute;top:12px;left:12px;font-size:12px;font-weight:700;padding:5px 12px;border-radius:var(--pill);}
  .badge-desconto{background:var(--lime);color:#18181b;}
  .badge-erro{background:var(--erro-bg);color:var(--erro-text);}
  .of-publicado{position:absolute;top:12px;right:12px;background:rgba(24,24,27,.72);color:#f7f7f5;font-size:12px;font-weight:600;padding:4px 10px;border-radius:var(--pill);}
  .of-body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:5px;flex:1;}
  .of-rota{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted-2);}
  .of-cidade{font-size:20px;font-weight:600;font-family:var(--sans);letter-spacing:-.2px;}
  .of-periodo{font-size:13px;color:var(--muted);}
  .of-preco-row{display:flex;align-items:baseline;gap:8px;margin-top:auto;padding-top:8px;flex-wrap:wrap;}
  .of-de s{font-size:14px;color:var(--muted);}
  .of-preco{font-size:30px;font-weight:700;color:var(--green-2);letter-spacing:-.5px;}
  .of-preco--sm{font-size:23px;margin-left:auto;}
  .of-iv{font-size:13px;color:var(--muted-2);}
  .of-cia{font-size:13px;color:var(--muted);}
  .of-erro-note{font-size:12px;line-height:1.4;color:#9a3412;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:6px 9px;margin-top:2px;}
  .of-cta{margin-top:8px;font-size:14px;font-weight:700;color:var(--green);}

  /* Styles / estilos de viagem */
  .styles-grid{display:grid;grid-template-columns:1fr 1.1fr;gap:56px;margin-top:40px;align-items:start;}
  .style-item{padding:36px 0;border-top:1px solid var(--border);opacity:.55;}
  .style-item.is-active{opacity:1;}
  .style-num{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--green);}
  .style-item h3{margin:12px 0 10px;font-size:32px;}
  .style-item p{margin:0 0 18px;font-size:16px;line-height:1.6;color:var(--muted);}
  .chips{display:flex;gap:8px;flex-wrap:wrap;}
  .chip{border:1px solid var(--border-2);background:var(--surface);border-radius:var(--pill);padding:7px 14px;font-size:13px;font-weight:600;color:var(--muted);}
  .style-cta{margin:18px 0 0;}
  .styles-imgs{position:sticky;top:96px;height:560px;}
  .style-img{position:absolute;inset:0;opacity:0;transition:opacity .5s;border-radius:24px;overflow:hidden;}
  .style-img.is-active{opacity:1;}
  .style-legenda{position:absolute;bottom:16px;right:16px;background:rgba(24,24,27,.75);color:#f7f7f5;border-radius:12px;padding:9px 15px;font-size:13px;font-weight:600;}

  /* Roteiros (revista) */
  .roteiros{background:#18181b;color:#f7f7f5;margin-top:56px;position:relative;overflow:hidden;}
  .roteiros .wrap{padding-top:72px;padding-bottom:72px;position:relative;z-index:1;}

  /* Globo 3D de arame (CSS 3D puro, sem canvas/WebGL) */
  .globe3d{position:absolute;top:56px;right:-40px;width:192px;height:192px;z-index:0;
    perspective:620px;opacity:.4;pointer-events:none;}
  .g3-inner{position:absolute;inset:0;transform-style:preserve-3d;will-change:transform;
    animation:g3Spin 34s linear infinite;}
  .g3-mer,.g3-par{position:absolute;border:1px solid var(--lime);border-radius:50%;}
  .g3-mer{inset:0;}
  .g3-par{top:50%;left:50%;border-color:rgba(163,230,53,.55);}
  .g3-orbit{position:absolute;inset:0;transform:rotateX(74deg);transform-style:preserve-3d;}
  .g3-orbit-spin{position:absolute;inset:0;transform-style:preserve-3d;animation:g3Spin 11s linear infinite reverse;}
  .g3-orbit-dot{position:absolute;top:50%;left:50%;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;
    border-radius:50%;background:var(--lime-2);box-shadow:0 0 10px 2px rgba(163,230,53,.65);
    transform:translateX(112px);}
  @keyframes g3Spin{from{transform:rotateY(0deg);}to{transform:rotateY(360deg);}}
  @media (max-width:900px){ .globe3d{display:none;} }

  /* Profundidade 3D do hero: a foto ativa deriva lentamente no eixo Z. */
  .hero{perspective:1000px;}
  .hero-bgs{transform-style:preserve-3d;}
  .hero-bg.is-active{animation:heroDrift 22s ease-in-out infinite alternate;}
  @keyframes heroDrift{
    from{transform:translateZ(0) scale(1.02) rotate(0deg);}
    to{transform:translateZ(52px) scale(1.02) rotate(.6deg);}
  }

  @media (prefers-reduced-motion:reduce){
    .globe3d{display:none;}
    .hero-bg.is-active{animation:none;}
  }
  .roteiros-head h2{font-size:44px;}
  .roteiros-head p{margin:14px 0 0;font-size:16px;color:#a1a1a6;max-width:560px;}
  .roteiros-all a{color:var(--lime-2);font-weight:600;font-size:15px;}
  .rot-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:24px;margin-top:36px;}
  .rot-card{display:flex;flex-direction:column;gap:14px;color:#f7f7f5;}
  .rot-card:hover{color:#f7f7f5;transform:translateY(-3px);}
  .rot-media{height:240px;position:relative;border-radius:14px;overflow:hidden;}
  .rot-flag{position:absolute;top:12px;left:12px;background:var(--lime-2);color:#18181b;font-size:12px;font-weight:700;letter-spacing:.04em;padding:5px 12px;border-radius:var(--pill);}
  .rot-tag{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--lime-2);}
  .rot-body h3{margin:8px 0 6px;font-size:26px;line-height:1.15;}
  .rot-body p{margin:0 0 10px;font-size:15px;line-height:1.5;color:#a1a1a6;}
  .rot-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
  .rot-cta{font-size:14px;font-weight:600;color:var(--lime-2);}
  .rot-mes{font-size:12px;font-weight:600;color:#a1a1a6;border:1px solid #3f3f42;border-radius:var(--pill);padding:3px 10px;}

  /* Extras + confianca */
  .extras-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:20px;margin-top:32px;}
  .extra-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:26px;display:flex;flex-direction:column;gap:10px;color:inherit;}
  .extra-card:hover{border-color:var(--lime);color:inherit;}
  .extra-card--soon{opacity:.72;}
  .extra-cta--soon{color:var(--muted-2);font-style:italic;}
  .extra-sigla{width:38px;height:38px;border-radius:10px;background:var(--tint);color:var(--green);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;}
  .extra-card h3{font-size:20px;font-weight:600;font-family:var(--sans);}
  .extra-card p{margin:0;font-size:15px;color:var(--muted);line-height:1.5;}
  .extra-cta{font-size:14px;font-weight:600;color:var(--green);}
  .conf-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:32px;align-items:center;}
  .conf-card h2{font-size:30px;line-height:1.15;}
  .conf-valor{margin:0;font-size:26px;font-weight:700;color:var(--green-2);}
  .conf-stat p:last-child{margin:4px 0 0;font-size:14px;color:var(--muted);line-height:1.4;}

  /* Ofertas: filtro de origem + newsletter + como funciona */
  .orig-bar{position:sticky;top:68px;z-index:40;background:var(--surface);border-bottom:1px solid var(--border);}
  .orig-in{padding-top:14px;padding-bottom:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
  .orig-label{font-size:13px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted-2);}
  .orig-pills{display:flex;gap:8px;flex-wrap:wrap;}
  .orig-pill{border:1px solid var(--border-2);background:var(--surface);color:var(--muted);border-radius:var(--pill);padding:8px 16px;font-size:14px;font-weight:600;}
  .orig-pill.is-active{background:#18181b;color:#fff;border-color:#18181b;}
  .news-wrap{padding-top:32px;padding-bottom:8px;}
  .news-card{background:#18181b;color:#f7f7f5;border-radius:var(--r-lg);padding:40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:32px;align-items:center;}
  .news-copy h1{font-size:44px;line-height:1.05;}
  .news-copy p{margin:16px 0 0;font-size:16px;color:#a1a1a6;line-height:1.5;max-width:440px;}
  .news-form{display:flex;flex-direction:column;gap:12px;}
  .news-form input,.news-form select{border:1px solid #3f3f42;background:#26262a;border-radius:12px;padding:14px 16px;font-family:var(--sans);font-size:15px;color:#f7f7f5;}
  .news-row{display:flex;gap:12px;flex-wrap:wrap;}
  .news-row input{flex:1;min-width:140px;}
  .news-fine{font-size:12px;color:#a1a1a6;text-align:center;}
  .news-msg{margin:4px 0 0;font-size:14px;color:var(--lime-2);text-align:center;}
  .feed-count{font-size:14px;color:var(--muted-2);}
  /* Escolha do dia (/hoje) */
  .hoje-head{padding-bottom:0;}
  .hoje-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr));gap:28px;}
  .hoje-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;display:flex;flex-direction:column;}
  .hoje-media{position:relative;height:220px;}
  .hoje-body{padding:24px 26px 26px;display:flex;flex-direction:column;gap:10px;flex:1;}
  .hoje-titulo{font-size:28px;line-height:1.12;margin:2px 0 0;}
  .hoje-resumo{margin:0;font-size:15px;color:var(--muted);line-height:1.55;}
  .hoje-preco-row{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:4px 0 2px;}
  .hoje-bullets{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:12px;}
  .hoje-bullet{display:flex;gap:12px;align-items:flex-start;font-size:15px;line-height:1.5;}
  .hoje-dia{flex-shrink:0;background:var(--tint);color:var(--green-2);font-size:12px;font-weight:700;
    padding:3px 10px;border-radius:var(--pill);margin-top:2px;white-space:nowrap;}
  .hoje-bullet strong{font-weight:600;}
  .hoje-pontos{margin:2px 0 0;color:var(--muted);font-size:14px;}
  .hoje-comer{margin:2px 0 0;font-size:14px;color:var(--muted);}
  .hoje-mes{margin:8px 0 0;font-size:14px;color:var(--muted);}
  .hoje-ctas{display:flex;gap:10px;flex-wrap:wrap;margin-top:auto;padding-top:14px;}
  .btn-ghost--claro{color:var(--text);border-color:var(--border-2);}
  .btn-ghost--claro:hover{color:var(--text);border-color:var(--green);}
  .feed-vazio{grid-column:1/-1;margin:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);
    padding:28px;font-size:16px;line-height:1.6;color:var(--muted);}
  .cf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:20px;margin-top:8px;}
  .cf-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:26px;}
  .cf-num{display:inline-flex;width:36px;height:36px;border-radius:10px;background:var(--tint);color:var(--green);align-items:center;justify-content:center;font-size:16px;font-weight:700;}
  .cf-card h3{margin:14px 0 6px;font-size:19px;font-weight:600;font-family:var(--sans);}
  .cf-card p{margin:0;font-size:15px;color:var(--muted);line-height:1.55;}
  .cf-note{margin:24px 0 0;font-size:13px;color:var(--muted);line-height:1.6;max-width:640px;}

  /* Oferta detalhe */
  .det{padding-top:32px;}
  .det-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:40px;align-items:start;}
  .det-grid--lock .semana-lock,
  .det-grid--lock .det-lock-more,
  .det-grid--lock .det-lock-extras{grid-column:1/-1;}
  .det-grid--lock .det-aside{position:static;}
  .semana-lock--embedded{margin-top:8px;scroll-margin-top:92px;}
  .semana-lock--embedded .guia-h2{font-size:clamp(28px,4vw,36px);margin-bottom:16px;}
  .det-lock-extras{display:flex;flex-direction:column;gap:16px;max-width:420px;}
  .det-badges{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;}
  .det-badge{font-size:13px;font-weight:700;padding:5px 14px;border-radius:var(--pill);}
  .det-pub{font-size:13px;color:var(--muted-2);}
  .det-rota{font-size:15px;font-weight:600;letter-spacing:.06em;color:var(--muted-2);}
  .det-cidade{margin:6px 0 0;font-size:clamp(38px,6vw,52px);line-height:1.02;}
  .det-local{margin:2px 0 0;font-size:17px;color:var(--muted);}
  .det-preco-row{display:flex;align-items:baseline;gap:14px;margin:24px 0 6px;flex-wrap:wrap;}
  .det-preco{font-size:clamp(40px,8vw,56px);font-weight:700;color:var(--green-2);letter-spacing:-1.5px;line-height:1;}
  .det-media s{font-size:18px;color:var(--muted);}
  .det-econ{display:inline-block;background:var(--tint);color:var(--green-2);font-size:14px;font-weight:700;padding:6px 14px;border-radius:var(--pill);}
  .det-fonte-preco,.hoje-fonte-preco{margin:4px 0 0;font-size:13px;color:var(--muted);line-height:1.45;}
  .det-texto{margin:24px 0 0;font-size:17px;line-height:1.6;color:var(--muted);}
  .det-prova{margin-top:28px;position:relative;height:280px;border-radius:14px;overflow:hidden;background:var(--tint);}
  .det-prova-media{width:100%;height:100%;}
  .det-prova-tag{position:absolute;top:12px;left:12px;background:rgba(24,24,27,.75);color:#f7f7f5;font-size:12px;font-weight:600;padding:5px 12px;border-radius:var(--pill);}
  .det-h2{margin:36px 0 14px;font-size:22px;font-weight:700;font-family:var(--sans);}
  .det-flex{display:flex;flex-direction:column;gap:8px;}
  .det-flex-row{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 18px;}
  .det-flex-row strong{color:var(--green-2);font-size:17px;}
  .det-dicas{display:flex;flex-direction:column;gap:10px;}
  .det-dica{display:flex;gap:10px;font-size:15px;line-height:1.5;color:var(--muted);}
  .det-dica span:first-child{color:var(--green);font-weight:700;}
  .det-aside{position:sticky;top:92px;display:flex;flex-direction:column;gap:16px;}
  .det-buy{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:24px;box-shadow:0 24px 48px -34px rgba(24,24,27,.3);}
  .det-buy-label{font-size:13px;color:var(--muted-2);}
  .det-buy-preco{margin:2px 0 0;font-size:36px;font-weight:700;color:var(--green-2);letter-spacing:-1px;}
  .det-buy-sub{margin:2px 0 16px;font-size:14px;color:var(--muted);}
  .det-buy-cta{width:100%;font-size:16px;}
  .det-buy-cta-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin-top:0;}
  .det-buy-cta-row .det-buy-cta{width:auto;flex:0 1 auto;}
  .det-buy-cta-row .det-buy-fonte{margin:0;font-size:13px;color:var(--muted);line-height:1.45;}
  .det-buy-fine{margin:12px 0 0;font-size:12px;color:var(--muted);line-height:1.5;text-align:center;}
  /* Historico de preco (sparkline). Fica no mesmo cartao claro do aside. */
  .det-hist{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:18px;margin-bottom:16px;}
  .det-hist-title{margin:0 0 10px;font-size:14px;font-weight:700;color:var(--text);}
  .det-hist svg{display:block;width:100%;height:auto;max-width:100%;}
  .det-hist-fine{margin:10px 0 0;font-size:12px;color:var(--muted);line-height:1.45;}
  .prep{scroll-margin-top:90px;}
  .prep-sub{margin:0 0 18px;font-size:16px;color:var(--muted);max-width:70ch;}
  .prep-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:16px;}
  .prep-item{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;}
  .prep-rotulo{display:block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--green-2);margin-bottom:8px;}
  .prep-valor{margin:0;font-size:15px;line-height:1.55;color:var(--text);}
  .prep-nota{margin:10px 0 0;font-size:13.5px;line-height:1.5;color:var(--muted);border-left:3px solid var(--tint-border);padding-left:10px;}
  .prep-fonte{margin:16px 0 0;font-size:13px;line-height:1.6;color:var(--muted);max-width:80ch;}
  .nf-saidas{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0;}
  .unsub-form{display:flex;flex-direction:column;gap:8px;max-width:380px;margin:18px 0;}
  .unsub-lab{font-size:13px;font-weight:600;color:var(--muted);}
  .unsub-input{padding:12px 14px;border:1px solid var(--border-2);border-radius:var(--pill);background:var(--input-bg);color:var(--text);font:inherit;font-size:16px;}
  .det-cidade-origem{display:block;font-family:var(--sans);font-size:15px;font-weight:600;color:var(--muted);letter-spacing:0;margin-top:6px;}
  .det-alert{background:#18181b;color:#f7f7f5;border-radius:var(--r);padding:22px;}
  .det-alert-title{margin:0 0 4px;font-size:15px;font-weight:700;}
  .det-alert p{margin:0 0 14px;font-size:13px;color:#a1a1a6;line-height:1.5;}
  .det-alert .btn{width:100%;}
  .rel-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:20px;}
  .rel-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;display:flex;flex-direction:column;gap:4px;color:inherit;}
  .rel-card:hover{border-color:var(--lime);color:inherit;}
  .rel-top{display:flex;align-items:center;justify-content:space-between;gap:8px;}
  .rel-rota{font-size:13px;font-weight:600;letter-spacing:.06em;color:var(--muted-2);}
  .rel-badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:var(--pill);}
  .rel-card h3{margin:2px 0 4px;font-size:19px;font-weight:600;font-family:var(--sans);}
  .rel-preco{font-size:26px;font-weight:700;color:var(--green-2);letter-spacing:-.5px;}
  .rel-cia{font-size:13px;color:var(--muted);}

  /* Guia / roteiro */
  .guia-top{padding-top:40px;}
  .guia-hero{position:relative;height:420px;border-radius:24px;overflow:hidden;background:var(--tint);}
  .guia-hero-flags{position:absolute;left:24px;bottom:24px;display:flex;gap:10px;}
  .flag{font-size:12px;font-weight:700;letter-spacing:.04em;padding:6px 14px;border-radius:var(--pill);}
  .flag-lime{background:var(--lime-2);color:#18181b;}
  .flag-dark{background:rgba(24,24,27,.75);color:#f7f7f5;text-transform:uppercase;letter-spacing:.05em;}
  .guia-intro-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:48px;margin-top:36px;align-items:start;}
  .guia-title{font-size:clamp(38px,6vw,54px);line-height:1.05;}
  .guia-intro{margin:18px 0 0;font-size:18px;line-height:1.6;color:var(--muted);}
  .guia-aside{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:24px;display:flex;flex-direction:column;gap:14px;position:sticky;top:92px;}
  .guia-aside h3,.guia-aside-h{font-size:16px;font-weight:700;font-family:var(--sans);margin:0;line-height:1.3;}
  .guia-meta-row{display:flex;justify-content:space-between;gap:12px;font-size:14px;border-bottom:1px solid var(--border);padding-bottom:10px;}
  .guia-meta-row span{color:var(--muted-2);}
  .guia-meta-row strong{text-align:right;}
  .guia-aside-preco{font-size:13px;color:var(--muted);text-align:center;}
  .escopo-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:26px 28px;max-width:860px;}
  .escopo-h{font-size:22px;font-weight:700;font-family:var(--sans);margin:0 0 16px;}
  .escopo-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:24px;}
  .escopo-tit{margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;}
  .escopo-tit--sim{color:var(--green-2);}
  .escopo-tit--nao{color:#9a3412;}
  .escopo-cols ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:15px;line-height:1.5;color:var(--muted);}
  .escopo-nota{margin:18px 0 0;font-size:13px;line-height:1.6;color:var(--muted);border-top:1px solid var(--border);padding-top:14px;}
  .guia-h2{font-size:36px;margin-bottom:28px;}
  .semana-lock{max-width:860px;}
  .semana-lock-aviso{margin:0 0 18px;font-size:15px;line-height:1.6;color:var(--text);background:var(--tint);border:1px solid var(--tint-border);border-radius:12px;padding:14px 18px;}
  .semana-lock-meta{margin:0 0 14px;font-size:16px;line-height:1.6;color:var(--muted);}
  .semana-lock-fare{margin:0 0 6px;font-size:16px;line-height:1.55;color:var(--text);}
  .semana-lock-fare-note{margin:0 0 18px;font-size:13px;line-height:1.55;color:var(--muted);}
  .semana-lock-cta{margin:0 0 24px;}
  .semana-lock-guia{margin:18px 0 0;font-size:15px;line-height:1.55;}
  .semana-lock-guia a{color:var(--green-2);}
  .dias{display:flex;flex-direction:column;gap:20px;max-width:860px;}
  .dia{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:28px;display:grid;grid-template-columns:64px 1fr;gap:24px;}
  .dia-num{width:56px;height:56px;border-radius:14px;background:#18181b;color:var(--lime-2);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;}
  .dia-num span{font-size:10px;font-weight:700;letter-spacing:.08em;}
  .dia-num strong{font-size:24px;}
  .dia-body h3{font-size:22px;font-weight:600;font-family:var(--sans);}
  .dia-desc{margin:6px 0 14px;font-size:15px;color:var(--muted);line-height:1.55;}
  .dia-pontos{display:flex;flex-direction:column;gap:10px;}
  .dia-ponto{display:flex;gap:10px;font-size:15px;line-height:1.5;}
  .dia-bullet{color:var(--green);font-weight:700;flex-shrink:0;}
  .dia-ponto--rich{gap:14px;align-items:flex-start;}
  .dia-ponto-thumb{width:76px;height:56px;border-radius:10px;overflow:hidden;flex-shrink:0;background:var(--tint);}
  .dia-ponto-thumb.media-img,.dia-ponto-thumb .media-img{width:100%;height:100%;object-fit:cover;}
  .dia-ponto-body{display:flex;flex-direction:column;gap:2px;}
  .dia-ponto-nota{color:var(--muted);}
  .dia-ponto-meta{font-size:13px;color:var(--muted-2);}
  .dia-ponto-credit{font-size:11px;color:var(--muted-2);}
  .stars{color:var(--lime);letter-spacing:1px;}
  .dia-rest{margin-top:16px;background:var(--tint);border-radius:12px;padding:14px 18px;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;}
  .dia-rest-label{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--green);white-space:nowrap;}
  .dia-rest span:last-child{font-size:15px;color:#3f4a2a;line-height:1.5;}
  .dia-rest-link{color:inherit;}
  .dia-rest-link:hover{color:var(--green-2);}
  .dia-map{display:inline-flex;align-items:center;gap:6px;margin-top:14px;font-size:13px;font-weight:600;color:var(--green);}
  .dia-map:hover{color:var(--green-2);}
  .dia-map-pin{font-size:13px;}
  .lodging{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:24px;display:flex;flex-direction:column;gap:14px;align-items:flex-start;max-width:860px;}
  .lodging-base{margin:0;font-size:16px;color:var(--muted);line-height:1.6;}
  .explore{background:#18181b;color:#f7f7f5;border-radius:var(--r-lg);padding:36px;display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:center;overflow:hidden;}
  .explore-copy h2{font-size:34px;line-height:1.1;margin:2px 0 0;}
  .explore-copy p{margin:12px 0 20px;font-size:16px;color:#a1a1a6;max-width:44ch;}
  .explore-map{position:relative;display:block;height:220px;border-radius:var(--r);overflow:hidden;border:1px solid #3f3f42;}
  .explore-map .media-placeholder{position:absolute;inset:0;}
  .explore-map-badge{position:absolute;left:14px;bottom:14px;background:rgba(24,24,27,.72);color:#f7f7f5;font-size:13px;font-weight:600;padding:6px 12px;border-radius:var(--pill);}

  /* Otimizador */
  .opt{padding-top:16px;padding-bottom:40px;}
  .opt-head{display:flex;align-items:flex-end;gap:24px;flex-wrap:wrap;margin-bottom:24px;}
  .opt-head h2{font-size:36px;}
  .opt-sub{margin:0;font-size:15px;color:var(--muted);max-width:460px;line-height:1.5;}
  .opt-grid-wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:24px;align-items:start;}
  .opt-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:24px;}
  .opt-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;font-size:13px;font-weight:700;}
  .opt-legend{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-2);font-weight:400;}
  .opt-sw{width:14px;height:10px;border-radius:3px;display:inline-block;}
  .opt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:8px;}
  .opt-cell{border:1px solid;border-radius:10px;padding:11px 6px;text-align:center;}
  .opt-mon{font-size:12px;font-weight:600;opacity:.8;}
  .opt-price{font-size:14px;font-weight:700;margin-top:3px;}
  .opt-foot{margin:16px 0 0;font-size:12px;color:var(--muted);line-height:1.5;}
  .opt-side{display:flex;flex-direction:column;gap:16px;}
  .opt-window{background:#18181b;color:#f7f7f5;border-radius:var(--r);padding:24px;}
  .opt-window h3{font-size:30px;margin:10px 0 8px;}
  .opt-window-price{display:flex;align-items:baseline;gap:8px;}
  .opt-window-price span{font-size:30px;font-weight:700;color:var(--lime-2);}
  .opt-window-price small{font-size:14px;color:#a1a1a6;}
  .opt-save{display:inline-block;margin:12px 0;background:rgba(163,230,53,.15);color:var(--lime-2);font-size:13px;font-weight:700;padding:5px 12px;border-radius:var(--pill);}
  .opt-window p{margin:0 0 18px;font-size:14px;color:#a1a1a6;line-height:1.5;}
  .opt-window .btn{width:100%;}
  .opt-sources{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:22px;}
  .opt-sources-title{font-size:13px;font-weight:700;}
  .opt-sources-list{display:flex;flex-direction:column;gap:8px;margin-top:14px;}
  .opt-src{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;}
  .opt-src--best{background:var(--tint);border-color:#d9edb8;}
  .opt-src-name{font-size:15px;font-weight:700;}
  .opt-src--best .opt-src-name,.opt-src--best .opt-src-price{color:var(--green-2);}
  .opt-src-note{display:block;font-size:12px;color:var(--muted-2);}
  .opt-src-price{font-size:17px;font-weight:700;white-space:nowrap;}
  .opt-ring-wrap{display:flex;justify-content:center;padding:6px 0 2px;}
  .season-ring{width:100%;max-width:300px;height:auto;display:block;}

  /* Datas para viajar (clicar e reservar) */
  .dt-note{font-size:14px;color:var(--muted-2);}
  .dt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:16px;margin-top:24px;}
  .dt-card{position:relative;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:22px;display:flex;flex-direction:column;gap:4px;}
  .dt-card--best{border-color:var(--lime);box-shadow:0 16px 32px -26px rgba(24,24,27,.35);}
  .dt-flag{position:absolute;top:-11px;left:20px;background:var(--lime);color:#18181b;font-size:12px;font-weight:700;letter-spacing:.04em;padding:4px 12px;border-radius:var(--pill);}
  .dt-when{font-size:18px;font-weight:700;color:var(--text);}
  .dt-price{font-size:28px;font-weight:700;color:var(--green-2);letter-spacing:-.5px;}
  .dt-sub{font-size:13px;color:var(--muted);}
  .dt-cta{margin-top:12px;width:100%;font-size:15px;}

  /* Mini-mapa do destino */
  .guia-map{height:340px;border-radius:var(--r-lg);overflow:hidden;border:1px solid var(--border);background:var(--tint);}
  .guia-map--placeholder{position:relative;display:flex;align-items:center;justify-content:center;}
  .guia-map--placeholder .media-placeholder{position:absolute;inset:0;opacity:.5;}
  .guia-map-link{position:relative;}

  .guia-cta{background:#18181b;color:#f7f7f5;border-radius:var(--r-lg);padding:44px;display:flex;align-items:center;justify-content:space-between;gap:32px;flex-wrap:wrap;}
  .guia-cta h2{font-size:34px;}
  .guia-cta p{margin:10px 0 0;font-size:16px;color:#a1a1a6;}
  .guia-cta-btns{display:flex;gap:12px;flex-wrap:wrap;}

  /* Resultados de voo */
  .res-topbar{background:#18181b;color:#f7f7f5;}
  .res-topbar-in{padding:28px 32px;display:flex;align-items:center;gap:28px;flex-wrap:wrap;}
  .res-rota{display:flex;align-items:center;gap:14px;margin:0;font-weight:400;}
  .res-rota span{font-family:var(--serif);font-size:26px;}
  .res-rota i{color:var(--lime);font-size:18px;font-style:normal;}
  .res-resumo{font-size:15px;color:#a1a1a6;}
  .res-alterar{margin-left:auto;padding:9px 18px;font-size:14px;font-weight:600;border-radius:var(--pill);}
  .res-grid{padding-top:32px;padding-bottom:88px;display:grid;grid-template-columns:minmax(220px,260px) minmax(0,1fr);gap:28px;align-items:start;}
  .res-side{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:22px;display:flex;flex-direction:column;gap:22px;position:sticky;top:92px;}
  .res-side h3{font-size:16px;font-weight:700;font-family:var(--sans);}
  .res-filtro{display:flex;flex-direction:column;gap:10px;}
  .res-side-title{font-family:var(--sans);font-size:15px;font-weight:700;margin:0 0 4px;letter-spacing:0;}
  .res-filtro-title{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted-2);}
  .res-check{display:flex;align-items:center;gap:10px;font-size:15px;cursor:pointer;}
  .res-check input{accent-color:var(--green);width:16px;height:16px;}
  .res-help{border-top:1px solid var(--border);padding-top:16px;font-size:13px;color:var(--muted);line-height:1.5;}
  .res-list{display:flex;flex-direction:column;gap:16px;}
  .res-sortbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:15px;color:var(--muted);}
  .res-sort{border:1px solid var(--border-2);background:var(--surface);color:var(--muted);border-radius:var(--pill);padding:7px 15px;font-family:var(--sans);font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;}
  .res-sort.is-active{background:#18181b;color:#fff;border-color:#18181b;}
  .res-voo{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:22px 24px;display:flex;flex-wrap:wrap;gap:20px;align-items:center;position:relative;}
  .res-voo--melhor{border-color:var(--lime);}
  .res-melhor{position:absolute;top:-11px;left:20px;background:var(--lime);color:#18181b;font-size:12px;font-weight:700;letter-spacing:.04em;padding:4px 12px;border-radius:var(--pill);}
  .res-cia{display:flex;flex-direction:column;gap:4px;width:110px;flex-shrink:0;}
  .res-cia strong{font-size:15px;}
  .res-cia span{font-size:13px;color:var(--muted-2);}
  .res-trecho{display:flex;align-items:center;gap:16px;flex:1 1 300px;min-width:min(260px,100%);}
  .res-hora{text-align:center;}
  .res-hora p{margin:0;font-size:22px;font-weight:600;}
  .res-hora span{font-size:13px;color:var(--muted-2);}
  .res-linha{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;}
  .res-dur{font-size:12px;color:var(--muted-2);}
  .res-track{width:100%;height:2px;background:var(--border);position:relative;}
  .res-track i{position:absolute;right:-1px;top:-3px;width:8px;height:8px;border-radius:50%;background:var(--green);}
  .res-parada{font-size:12px;font-weight:600;}
  .res-parada--direto{color:var(--green-2);}
  .res-parada--conex{color:var(--muted-2);}
  .res-preco{text-align:right;border-left:1px solid var(--border);padding-left:20px;margin-left:auto;}
  .res-preco-label{margin:0;font-size:13px;color:var(--muted-2);}
  .res-preco-val{margin:4px 0 0;font-size:24px;font-weight:700;color:var(--green-2);}
  .res-parcela{margin:2px 0 0;font-size:13px;color:var(--muted);}
  .res-sel{background:#18181b;color:#fff;padding:14px 24px;white-space:nowrap;}
  .res-sel:hover{background:var(--green-2);}
  .res-pix{background:var(--tint);border:1px solid #d9edb8;border-radius:var(--r);padding:18px 24px;display:flex;align-items:center;gap:14px;font-size:15px;color:var(--green-2);}
  .res-pix>strong:first-child{font-size:18px;}

  /* Mapa */
  .map-head{padding-top:40px;}
  .map-title{font-size:clamp(32px,5vw,44px);margin:0 0 8px;}
  .map-sub{margin:0;font-size:17px;color:var(--muted);max-width:60ch;}
  /* Filtro do /guias. Nasce com [hidden] no HTML; o JS tira. */
  .guia-busca{margin:20px 0 0;max-width:420px;}
  .guia-busca[hidden]{display:none;}
  .guia-busca-lab{display:block;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px;}
  .guia-busca-campo{width:100%;padding:12px 14px;border:1px solid var(--border-2);border-radius:var(--pill);
    background:var(--input-bg);color:var(--text);font:inherit;font-size:16px;}
  .guia-busca-campo:focus-visible{outline:2px solid var(--green);outline-offset:2px;border-color:var(--green);}
  .guia-busca-conta{margin:8px 0 0;font-size:14px;color:var(--muted);min-height:1.3em;}
  .rot-card[hidden]{display:none;}
  .map-grid{margin-top:28px;padding-bottom:88px;display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,340px);gap:24px;align-items:start;}
  .map-canvas{height:560px;border-radius:var(--r-lg);overflow:hidden;border:1px solid var(--border);background:var(--tint);}
  .map-canvas--placeholder{position:relative;display:flex;align-items:center;justify-content:center;}
  .map-canvas--placeholder .media-placeholder{position:absolute;inset:0;opacity:.5;}
  .map-canvas--err{display:flex;align-items:center;justify-content:center;}
  .map-canvas-msg{position:relative;max-width:360px;margin:0;background:rgba(255,255,255,.92);border:1px solid var(--border);border-radius:12px;padding:16px 18px;font-size:14px;color:var(--muted);line-height:1.5;text-align:center;}
  .map-canvas-msg code{background:var(--tint);color:var(--green-2);padding:1px 6px;border-radius:6px;font-size:13px;}
  .map-list{display:flex;flex-direction:column;gap:8px;max-height:560px;overflow-y:auto;}
  .map-dest{display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px;color:inherit;}
  .map-dest:hover{border-color:var(--lime);color:inherit;background:var(--surface);}
  .map-dest-pin{color:var(--green);font-size:13px;flex-shrink:0;}
  .map-dest-body{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;}
  .map-dest-body strong{font-size:15px;font-weight:600;}
  .map-dest-tag{font-size:12px;color:var(--muted-2);}
  .map-dest-preco{font-size:14px;font-weight:700;color:var(--green-2);white-space:nowrap;}
  .map-iw{max-width:220px;font-family:var(--sans);}
  .map-iw strong{display:block;font-size:15px;color:#18181b;margin-bottom:2px;}
  .map-iw-tag{display:block;font-size:12px;color:var(--muted);}
  .map-iw-resumo{display:block;font-size:13px;color:var(--muted);line-height:1.4;margin:6px 0;}
  .map-iw-link{font-size:14px;font-weight:700;color:var(--green);}

  /* Integridade / confianca no detalhe da oferta */
  .fare-error-note{background:#fff7ed;border:1px solid #fed7aa;border-radius:var(--r);padding:14px 16px;font-size:13px;line-height:1.5;color:#7c2d12;margin:18px 0 0;}
  .fare-error-note strong{color:#9a3412;}
  .det-buy-perks{margin:12px 0 0;font-size:13px;font-weight:700;color:var(--green-2);text-align:center;}
  .trust-mini{display:flex;flex-direction:column;gap:10px;background:var(--tint);border:1px solid #d9edb8;border-radius:var(--r);padding:16px;margin-top:14px;}
  .trust-mini-item{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.5;color:var(--green-2);}
  .trust-mini-ico{flex-shrink:0;font-size:15px;line-height:1.4;}
  .det-alert .det-alert-input,.det-alert input[type=email],.det-alert select{width:100%;border:1px solid #3f3f42;background:#26262a;border-radius:10px;padding:12px 14px;font-family:var(--sans);font-size:14px;color:#f7f7f5;margin-top:6px;}
  .det-alert .btn{width:100%;margin-top:8px;}
  .det-alert-orig{display:block;font-size:12px;color:#a1a1a6;}
  /* Seletor de origem alteravel (permite que pessoas de outros estados reservem
     a mesma rota, trocando a origem na URL do Aviasales). */
  .origin-selector{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:18px;margin-bottom:16px;}
  .origin-selector label{display:block;margin-bottom:8px;font-size:13px;font-weight:700;color:var(--text);}
  .origin-selector select{width:100%;background:var(--input-bg);color:var(--text);border:1px solid var(--border-2);border-radius:10px;padding:10px;font-size:14px;font-family:var(--sans);}
  .origin-selector-note{margin:10px 0 0;font-size:12px;color:var(--muted);line-height:1.45;}
  /* Compartilhamento WhatsApp */
  .det-share{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:18px;}
  .det-share-title{margin:0 0 10px;font-size:14px;font-weight:700;color:var(--text);}
  .det-share-btn{display:block;width:100%;background:var(--green);color:var(--on-green);padding:10px;border-radius:10px;font-size:14px;font-weight:600;text-align:center;}
  .det-share-btn:hover{background:var(--green-2);color:var(--on-green);}
  .det-share-note{margin:10px 0 0;font-size:12px;color:var(--muted);line-height:1.45;}
  .opt-foot--disclaimer{color:#8a8a84;}

  /* Faixa de captura (strip) */
  .news-whatsapp-note{font-size:11px;color:#a1a1a6;display:block;margin-top:-4px;}
  .news-strip-wrap{padding:48px 32px 0;}
  .news-strip{background:#18181b;color:#f7f7f5;border-radius:var(--r-lg);padding:28px 32px;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;}
  .news-strip-copy{max-width:480px;}
  .news-strip-copy h2{font-size:26px;line-height:1.15;margin:2px 0 0;}
  .news-strip-copy p{margin:8px 0 0;font-size:14px;color:#a1a1a6;}
  .news-form--strip{display:flex;gap:10px;flex-wrap:wrap;flex:1;min-width:280px;max-width:440px;}
  .news-form--strip input,.news-form--strip select{border:1px solid #3f3f42;background:#26262a;border-radius:10px;padding:11px 14px;font-family:var(--sans);font-size:14px;color:#f7f7f5;flex:1;min-width:150px;}
  .news-form--strip .btn{flex-basis:100%;}
  .news-fine--strip{display:block;text-align:right;padding:6px 32px 0;font-size:11px;color:var(--muted-2);}

  /* Resultados: transparencia + captura */
  .res-fine{margin-top:4px;font-size:12px;color:var(--muted-2);text-align:center;}
  .res-amostra--pax{background:#fff7ed;border-color:#fed7aa;color:#9a3412;}
  .res-amostra--erro{background:var(--risk-bg);border:1px solid var(--risk-border);border-left-width:4px;color:var(--risk-text);}
  /* Busca ao vivo: borda verde solida e fundo mais forte, para separar na
     hora do aviso de "exemplo". Cor nao e o unico sinal — o texto muda. */
  .res-amostra--vivo{background:var(--tint);border:1px solid var(--green);border-left-width:4px;color:var(--green-2);}
  .res-amostra{background:var(--tint);border:1px solid #d9edb8;border-radius:var(--r);padding:14px 18px;font-size:14px;color:var(--green-2);margin-bottom:4px;}
  .res-vazio{background:var(--surface);border:1px dashed var(--border-2);border-radius:var(--r);padding:22px;text-align:center;color:var(--muted);font-size:14px;}
  .res-alert-banner{background:#18181b;color:#f7f7f5;border-radius:var(--r);padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;font-size:15px;}
  .res-alert-banner strong{color:#fff;}
  .res-alert-banner span{color:#a1a1a6;}
  .res-alert-form{display:flex;gap:10px;flex-wrap:wrap;flex:1;min-width:min(260px,100%);max-width:420px;}
  .res-alert-form input[type=email]{flex:1;min-width:150px;border:1px solid #3f3f42;background:#26262a;border-radius:10px;padding:11px 14px;font-family:var(--sans);font-size:14px;color:#f7f7f5;}
  .res-alert-form .news-msg{flex-basis:100%;margin:0;color:var(--lime-2);font-size:13px;}

  /* Pagina de saida (interstitial) */
  .exit{padding:48px 32px 72px;max-width:920px;}
  .exit-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:36px;text-align:center;}
  .exit-card h1{font-size:32px;margin:8px 0 12px;}
  .exit-sub{color:var(--muted);max-width:52ch;margin:0 auto 24px;}
  .exit-cta{font-size:17px;padding:16px 28px;}
  .exit-fine{margin:14px 0 0;font-size:13px;color:var(--muted-2);}
  .exit-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:40px;}
  .exit-steps{margin:12px 0 0;padding-left:20px;color:var(--muted);line-height:1.6;}
  .exit-help{background:var(--tint);border-radius:var(--r);padding:24px;}
  .exit-help .btn{margin-top:6px;}
  .exit-help-note{font-size:13px;color:var(--muted);margin-top:14px;}

  /* Paginas de suporte (FAQ) */
  .help-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px 48px;}
  .help-group>p{color:var(--muted);}
  .faq-item{border-top:1px solid var(--border);padding:14px 0;}
  .faq-item summary{cursor:pointer;font-weight:600;list-style:none;}
  .faq-item summary::-webkit-details-marker{display:none;}
  .faq-item summary::after{content:"+";float:right;color:var(--green);font-weight:700;}
  .faq-item[open] summary::after{content:"–";}
  .faq-item p{margin:10px 0 0;color:var(--muted);line-height:1.55;}
  .help-fine{font-size:13px;color:var(--muted-2);}
  .alerts-form{display:flex;flex-direction:column;gap:12px;max-width:420px;}
  .alerts-form input[type=email]{border:1px solid var(--border-2);border-radius:12px;padding:13px 14px;font-family:var(--sans);font-size:15px;}
  .status-page{max-width:720px;}
  .status-page .btn{margin-top:8px;}

  /* Footer */
  .site-footer{background:var(--surface);border-top:1px solid var(--border);margin-top:56px;}
  .foot-grid{padding:56px 32px 40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:40px;}
  .brand--foot{--brand-fly:62px;}
  .brand--foot .brand-word{font-size:26px;}
  .brand--foot .brand-plane{color:var(--lime-2);width:12px;height:12px;margin-top:-11px;}
  .foot-brand p{margin:14px 0 0;font-size:14px;color:var(--muted);line-height:1.6;max-width:280px;}
  .foot-col{display:flex;flex-direction:column;gap:10px;font-size:14px;}
  .foot-title{font-weight:700;margin-bottom:4px;}
  .foot-link--soon{color:var(--muted-2);opacity:.7;cursor:not-allowed;}
  .foot-link--soon::after{content:" · em breve";font-size:11px;font-weight:400;}
  .foot-bar{border-top:1px solid var(--border);}
  .foot-bar-in{padding-top:20px;padding-bottom:24px;display:flex;flex-direction:column;gap:8px;}
  .foot-places{margin:0;font-size:13px;color:var(--muted);}
  .foot-lgpd{margin:0;font-size:12.5px;color:var(--muted);line-height:1.6;max-width:78ch;}
  .foot-legal{margin:0;font-size:12px;color:var(--muted-2);}

  /* Reflow a 320px CSS px (WCAG 1.4.10). Medido: /, /ofertas e as paginas de
     roteiro rolavam na horizontal porque o bloco de newsletter reservava
     40px de padding de cada lado. */
  /* Alvo de toque de 44x44 CSS px no celular (WCAG 2.5.8 / diretriz de mobile).
     Medido: links do menu e do rodape tinham 22px de altura — metade do
     minimo. Usa padding, nao height, para o texto continuar centrado. */
  @media (max-width:860px){
    .site-nav a,.foot-col a,.foot-legal a,.help-group a{min-height:44px;display:flex;align-items:center;}
    /* Abas do carrossel e "alterar busca" sao CONTROLES, nao links dentro de
       frase — a isencao de alvo inline da WCAG 2.5.8 nao vale para eles. */
    .hero-tab{min-height:44px;padding-top:8px;padding-bottom:8px;}
    .res-alterar{min-height:44px;}
    .tema-toggle{min-height:44px;min-width:44px;justify-content:center;}
    .site-atend{min-height:44px;}
    .res-sort,.orig-pill,.chip{min-height:44px;display:inline-flex;align-items:center;}
    .rot-cta,.of-cta,.dia-rest-link{min-height:44px;display:inline-flex;align-items:center;}
  }
  @media (max-width:420px){
    .news-card{padding:24px 16px;gap:20px;}
    .news-strip{padding:20px 16px;gap:16px;}
    .news-strip-copy,.news-form{min-width:0;}
    .wrap{padding-left:14px;padding-right:14px;}
    .conf-card{padding:24px 16px;}
    .escopo-card,.lodging,.dia,.opt-panel,.res-side,.guia-aside{padding:20px 16px;}
    .det-alert{padding:18px 16px;}
  }
  @media(max-width:860px){
    /* A LISTA vem primeiro no celular. Filtro e captura de e-mail sao uteis,
       mas nao na frente do que a pessoa veio ver. */
    .feed-ordem{display:flex;flex-direction:column;}
    .feed-ordem .feed-lista{order:1;}
    .feed-ordem .news-wrap{order:2;}
    .res-grid{display:flex;flex-direction:column;}
    .res-side{order:2;}
    .res-list{order:1;}
    .wrap{padding:0 20px;}
    /* padding LATERAL preservado: "padding:10px 0" zerava o respiro do .wrap e
       colava a marca na borda esquerda e o "Meus alertas" na direita — duas
       personas diferentes reclamaram disso na auditoria. */
    .site-header-in{height:auto;flex-wrap:wrap;padding:10px 20px;gap:10px 16px;}
    /* O menu rola na horizontal no celular, mas nao dava NENHUMA pista disso:
       uma pessoa na auditoria viu "Hotéis" cortado no meio da palavra e achou
       que o site estava quebrado. A mascara desbota a borda direita enquanto
       houver conteudo fora da tela, e some sozinha ao chegar no fim. */
    .site-nav{order:3;width:100%;gap:18px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px;font-size:14px;
      scrollbar-width:none;
      -webkit-mask-image:linear-gradient(to right,#000 calc(100% - 28px),transparent 100%);
      mask-image:linear-gradient(to right,#000 calc(100% - 28px),transparent 100%);}
    .site-nav::-webkit-scrollbar{display:none;}
    /* Ao chegar no fim da rolagem a mascara sai, senao o ultimo item fica
       desbotado para sempre e parece desabilitado. */
    .site-nav[data-fim="1"]{-webkit-mask-image:none;mask-image:none;}
    .site-nav a{white-space:nowrap;}
    /* O telefone NAO some mais no celular: a auditoria pegou um usuario de 68
       anos que rolou a home inteira procurando e "quase desistiu achando que
       nao tinha telefone nenhum". Some so o rotulo ATENDIMENTO, fica o numero. */
    .site-atend{align-items:flex-start;}
    .site-atend span{display:none;}
    .site-atend strong{font-size:15px;color:var(--green-2);text-decoration:underline;}
    .site-header-right{gap:10px;}
    .styles-grid{grid-template-columns:1fr;gap:24px;}
    /* relative, NAO static: .style-img e position:absolute;inset:0 e precisa
       deste elemento como bloco container. Com "static" ela escapava para o
       ancestral posicionado la em cima e virava uma camada de ~9000px por
       cima do feed de ofertas, roubando o toque dos cards no celular. */
    .styles-imgs{position:relative;height:320px;}
    .style-item{opacity:1;}
    .style-img{opacity:0;}.style-img.is-active{opacity:1;}
    .guia-intro-grid{grid-template-columns:1fr;gap:24px;}
    .det-aside{position:static;}
    .hero{height:520px;}
    .dia{grid-template-columns:1fr;gap:16px;}
    .dia-num{flex-direction:row;gap:6px;width:auto;padding:8px 14px;height:auto;}
    .res-grid{grid-template-columns:1fr;}
    .res-side{position:static;}
    .res-voo{gap:14px;}
    .res-preco{border-left:0;padding-left:0;text-align:left;}
    .exit-grid{grid-template-columns:1fr;}
    .help-grid{grid-template-columns:1fr;}
    .news-strip{flex-direction:column;align-items:stretch;}
    .explore{grid-template-columns:1fr;}
    .news-fine--strip{text-align:center;padding:6px 0 0;}
    .map-grid{grid-template-columns:1fr;}
    .map-canvas{height:380px;}
    .map-list{max-height:none;}
  }
  `;
  return _pageStylesCache;
}
