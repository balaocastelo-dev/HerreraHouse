/* Herrera HOUSE IA — página de vendas: números contando, telas aparecendo, abas, a planta e o "Fale com a gente" pelo WhatsApp. */
(function () {
  document.documentElement.classList.add('js');
  var calmo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // vídeo do 3D: o arquivo só entra quando vai tocar. No celular (ou com economia de dados) fica no poster até o clique.
  var video = document.querySelector('.palco video');
  var botao = document.querySelector('.palco-play');
  if (video) {
    var mobile = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    var economiza = mobile || (navigator.connection && navigator.connection.saveData);
    function fontes() {
      if (video.querySelector('source')) return;
      [['webm', 'video/webm'], ['mp4', 'video/mp4']].forEach(function (par) {
        var s = document.createElement('source');
        s.src = video.getAttribute('data-' + par[0]);
        s.type = par[1];
        video.appendChild(s);
      });
      video.load();
    }
    function esconde() { if (botao) botao.hidden = true; }
    function mostra() { if (botao) botao.hidden = false; }
    function tocar() {
      fontes();
      var p = video.play();
      if (p && p.then) p.then(esconde).catch(mostra);
      else esconde();
    }
    if (botao) botao.addEventListener('click', tocar);
    if (calmo) video.pause();
    else if (economiza) mostra();
    else if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) tocar(); else video.pause(); }); }, { threshold: 0.15 }).observe(video);
    } else tocar();
  }

  // números contando quando aparecem
  function formata(n) { return Math.round(n).toLocaleString('pt-BR'); }
  var numeros = Array.prototype.slice.call(document.querySelectorAll('[data-conta]'));
  function conta(el) {
    var alvo = +el.dataset.conta, suf = el.dataset.suf || '', ini = null, dur = 1400;
    function passo(t) { if (ini === null) ini = t; var k = Math.min(1, (t - ini) / dur); var e = 1 - Math.pow(1 - k, 3); el.textContent = formata(alvo * e) + suf; if (k < 1) requestAnimationFrame(passo); }
    requestAnimationFrame(passo);
  }
  if (!calmo && 'IntersectionObserver' in window && numeros.length) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { conta(e.target); io.unobserve(e.target); } }); }, { threshold: 0.6 });
    numeros.forEach(function (n) { n.textContent = '0' + (n.dataset.suf || ''); io.observe(n); });
  }

  // blocos aparecendo ao rolar
  var revelar = Array.prototype.slice.call(document.querySelectorAll('.revelar'));
  if ('IntersectionObserver' in window && !calmo) {
    var ir = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visto'); ir.unobserve(e.target); } }); }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revelar.forEach(function (r) { ir.observe(r); });
  } else revelar.forEach(function (r) { r.classList.add('visto'); });

  // a planta: toca no cômodo, a ficha mostra o que ele faz e leva à seção
  var fichas = {};
  document.querySelectorAll('.legenda-comodos li[data-comodo]').forEach(function (li) {
    fichas[li.dataset.comodo] = { titulo: li.querySelector('h3').textContent, texto: li.querySelector('p').textContent, ir: li.dataset.ir };
  });
  var ficha = document.getElementById('ficha');
  function mostra(chave) {
    var f = fichas[chave];
    if (!f || !ficha) return;
    document.querySelectorAll('.planta .comodo').forEach(function (c) { var s = c.dataset.comodo === chave; c.classList.toggle('ativo', s); c.setAttribute('aria-pressed', s ? 'true' : 'false'); });
    ficha.innerHTML = '';
    var h = document.createElement('h3'); h.textContent = f.titulo;
    var p = document.createElement('p'); p.textContent = f.texto;
    ficha.appendChild(h); ficha.appendChild(p);
    if (f.ir) { var a = document.createElement('a'); a.href = f.ir; a.textContent = 'Ver na página'; ficha.appendChild(a); }
  }
  document.querySelectorAll('.planta .comodo').forEach(function (c) {
    function age() {
      if (c.dataset.comodo === 'entrada') { document.getElementById('contato').scrollIntoView(); var n = document.querySelector('form.fale input'); if (n) n.focus({ preventScroll: true }); return; }
      mostra(c.dataset.comodo);
    }
    c.addEventListener('click', age);
    c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); age(); } });
  });
  mostra('escritorio');
  var planta = document.querySelector('.planta');
  if (planta && 'IntersectionObserver' in window && !calmo) {
    var ip = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { planta.classList.add('desenhar'); ip.disconnect(); } }, { threshold: 0.3 });
    ip.observe(planta);
  }

  // abas das telas (teclado: setas esquerda/direita)
  var abas = Array.prototype.slice.call(document.querySelectorAll('[data-abas] [role=tab]'));
  function abre(aba, foco) {
    abas.forEach(function (a) {
      var sel = a === aba;
      a.setAttribute('aria-selected', sel ? 'true' : 'false'); a.tabIndex = sel ? 0 : -1;
      var painel = document.getElementById(a.getAttribute('aria-controls')); if (painel) painel.hidden = !sel;
    });
    if (foco) aba.focus();
  }
  abas.forEach(function (a, i) {
    a.addEventListener('click', function () { abre(a); });
    a.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); abre(abas[(i + (e.key === 'ArrowRight' ? 1 : abas.length - 1)) % abas.length], true); }
    });
  });


  // Ao vivo: troca de imobiliária (abas com logo, rodízio sozinho até a pessoa mexer) e de versão do portal
  var avSec = document.getElementById('ao-vivo');
  if (avSec) {
    var avAbas = Array.prototype.slice.call(avSec.querySelectorAll('.av-aba'));
    var DUR = 7000, timer = null, parado = calmo, visivel = false;
    function avAbre(aba, foco) {
      avAbas.forEach(function (a) {
        var sel = a === aba;
        a.classList.toggle('ativa', sel); a.classList.remove('correndo');
        a.setAttribute('aria-selected', sel ? 'true' : 'false'); a.tabIndex = sel ? 0 : -1;
        var p = document.getElementById(a.getAttribute('aria-controls')); if (p) p.classList.toggle('ativo', sel);
      });
      avSec.style.setProperty('--c', getComputedStyle(aba).getPropertyValue('--c'));
      if (foco) aba.focus();
      agenda();
    }
    function agenda() {
      clearTimeout(timer);
      var at = avSec.querySelector('.av-aba.ativa');
      if (parado || !visivel || !at) return;
      void at.offsetWidth; at.style.setProperty('--dur', DUR + 'ms'); at.classList.add('correndo');
      timer = setTimeout(function () { avAbre(avAbas[(avAbas.indexOf(at) + 1) % avAbas.length]); }, DUR);
    }
    function para() { parado = true; clearTimeout(timer); avAbas.forEach(function (a) { a.classList.remove('correndo'); }); }
    avAbas.forEach(function (a, i) {
      a.addEventListener('click', function () { para(); avAbre(a); var lista = a.parentNode; if (lista.scrollWidth > lista.clientWidth) lista.scrollTo({ left: a.offsetLeft - (lista.clientWidth - a.offsetWidth) / 2, behavior: calmo ? 'auto' : 'smooth' }); });
      a.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); para(); avAbre(avAbas[(i + (e.key === 'ArrowRight' ? 1 : avAbas.length - 1)) % avAbas.length], true); }
      });
    });
    avSec.querySelectorAll('.av-painel').forEach(function (p) {
      p.addEventListener('pointerenter', function () { if (!parado) { clearTimeout(timer); avAbas.forEach(function (a) { a.classList.remove('correndo'); }); } });
      p.addEventListener('pointerleave', function () { if (!parado) agenda(); });
      var abrir = p.querySelector('.av-abrir'), url = p.querySelector('.av-url em'), base = abrir ? abrir.href.replace(/\/imoveis.*$/, '') : '';
      p.querySelectorAll('.av-ver').forEach(function (b) {
        b.addEventListener('click', function () {
          para();
          p.querySelectorAll('.av-ver').forEach(function (x) { var s = x === b; x.classList.toggle('ativa', s); x.setAttribute('aria-pressed', s ? 'true' : 'false'); });
          p.querySelectorAll('.av-img').forEach(function (im) { im.classList.toggle('ativa', im.dataset.v === b.dataset.v); });
          if (url) url.textContent = b.dataset.cam;
          if (abrir) abrir.href = base + b.dataset.cam;
        });
      });
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visivel = es[0].isIntersecting; if (visivel) agenda(); else clearTimeout(timer); }, { threshold: 0.35 }).observe(avSec);
    }
    // carrega as outras capturas depois que a página abriu, para a troca ser instantânea
    window.addEventListener('load', function () { setTimeout(function () { avSec.querySelectorAll('img[loading=lazy]').forEach(function (im) { im.loading = 'eager'; }); }, 1500); });
    avAbre(avAbas[0]);

    // "Como fica o endereço da sua imobiliária?"
    var nomeIn = document.getElementById('av-input'), slugEl = document.getElementById('av-slug'), nomeForm = avSec.querySelector('form.av-nome');
    function slug(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'e').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'suaimobiliaria'; }
    if (nomeIn) nomeIn.addEventListener('input', function () { slugEl.textContent = slug(nomeIn.value); });
    if (nomeForm) nomeForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = document.querySelector('form.fale textarea'), nome = nomeIn.value.trim();
      if (msg) msg.value = 'Quero o endereço ' + slug(nome) + '.corretordofuturo.app' + (nome ? ' para a ' + nome : '') + '.' + (msg.value ? '\n' + msg.value : '');
      var perfil = document.querySelector('form.fale select'); if (perfil && !perfil.value) perfil.value = 'Imobiliária parceira';
      document.getElementById('contato').scrollIntoView({ behavior: calmo ? 'auto' : 'smooth' });
      var n = document.querySelector('form.fale input[name=nome]'); if (n) setTimeout(function () { n.focus({ preventScroll: true }); }, calmo ? 0 : 600);
    });
  }

  // barra fixa: aparece depois da abertura, some perto do formulário
  var fixa = document.querySelector('.fixa'), abreEl = document.querySelector('.abre'), contato = document.getElementById('contato');
  if (fixa && abreEl && contato && 'IntersectionObserver' in window) {
    fixa.hidden = false;
    var passou = false, noFim = false;
    function poe() { var m = passou && !noFim; fixa.classList.toggle('mostra', m); fixa.setAttribute('aria-hidden', m ? 'false' : 'true'); fixa.querySelectorAll('a').forEach(function (a) { a.tabIndex = m ? 0 : -1; }); }
    new IntersectionObserver(function (es) { passou = !es[0].isIntersecting; poe(); }, { threshold: 0 }).observe(abreEl);
    new IntersectionObserver(function (es) { noFim = es[0].isIntersecting; poe(); }, { threshold: 0, rootMargin: '0px 0px 200px 0px' }).observe(contato);
  }

  // Fale com a gente: abre o WhatsApp com a mensagem pronta (nada é gravado)
  var form = document.querySelector('form.fale');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = new FormData(form);
    var linhas = ['Olá! Quero conhecer o Herrera HOUSE IA.', '',
      'Nome: ' + (d.get('nome') || ''),
      'Sou: ' + (d.get('perfil') || ''),
      'Cidade: ' + (d.get('cidade') || '')];
    if (d.get('mensagem')) linhas.push('', String(d.get('mensagem')));
    window.open('https://wa.me/' + form.dataset.whatsapp + '?text=' + encodeURIComponent(linhas.join('\n')), '_blank', 'noopener');
  });
  var ano = document.getElementById('ano'); if (ano) ano.textContent = new Date().getFullYear();
})();
