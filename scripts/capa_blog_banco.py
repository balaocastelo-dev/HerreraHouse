# -*- coding: utf-8 -*-
"""
Foto de capa das matérias do BANCO DE MATÉRIAS da plataforma Herrera HOUSE IA, feita na RTX 4090 do PC.

Mesmo gerador do Balão (Flux no ComfyUI local + conferência por um modelo
de visão do Ollama), mudando só:
  - a fila: capas/pendentes.json no ramo plataforma/banco-materias do repositório da plataforma;
  - o repositório onde a foto é presa: clone próprio (_banco_repo) e o comando
    node scripts/banco-materias.mjs capa <slug> foto.jpg (a matéria passa a "pronta");
  - registro e estado próprios (logs\\capa_blog_banco.log, data\\capas_blog_banco.json).
A entrega para as imobiliárias é feita depois pelo próprio banco (cada matéria vai para uma só).

  python capa_blog_banco.py                 faz o que estiver na fila
  python capa_blog_banco.py --ver           só mostra a fila
Instalação da tarefa (23h10 e 5h10): scripts\\instalar_tarefa_capa_banco.ps1.
Escrito em 28/10/2026 (Claude, Herrera HOUSE IA).
"""
import os, sys, time
from pathlib import Path

FABRICA = Path(os.environ.get("BALAO_FABRICA", r"C:\Users\user\balao-content-factory\publisher"))
sys.path.insert(0, str(FABRICA))
import capa_blog as c  # noqa: E402  (o gerador do Balão)

EU = "capa_blog_banco.py"
REPO = os.environ.get("PLATAFORMA_REPO", "balaocastelo-dev/Corretordofuturo.app")
c.FILA = f"https://raw.githubusercontent.com/{REPO}/refs/heads/plataforma/banco-materias/capas/pendentes.json"
c.REPO_URL = f"https://github.com/{REPO}.git"
c.REPO = Path(os.environ.get("BANCO_REPO", str(c.RAIZ / "_banco_repo")))
c.LOG = c.RAIZ / "logs" / "capa_blog_banco.log"
c.ESTADO = c.RAIZ / "data" / "capas_blog_banco.json"
c.SAIDA = c.RAIZ / "data" / "capas_blog_banco"
if EU not in c.OCUPANTES:
    c.OCUPANTES.append(EU)

# O que vai junto de todo pedido: fotografia de arquitetura, sem gente e sem escrita.
c.SEMPRE = (" Realistic architectural and interior design photography, landscape 16:9, natural light,"
            " shallow depth of field. No people, no human figures, no faces, no hands. No text, no letters,"
            " no numbers, no house numbers, no signs, no logos, no brand names, no watermark.")
# No lugar do reforço anti-MacBook do Balão: móvel e objeto genéricos, nada que pareça peça famosa.
c.SEM_CARA_DE_APPLE = (" Furniture, fixtures and objects are generic and unbranded, not recognizable designer"
                       " pieces; any TV or screen is switched off; any book or artwork has no readable writing.")
c.NAO_APPLE = ""   # sem a pergunta de Apple na conferência

RESERVA_SALA = ("An empty bright living room with light oak wooden floor, white walls and a large window with"
                " sheer linen curtains, a low beige sofa and a single green plant in a ceramic pot, soft morning"
                " daylight, wide-angle interior photography, eye level.",
                "Sala de estar clara com piso de madeira, sofá baixo bege, uma planta e uma grande janela com cortina leve")
RESERVA_DETALHE = ("Architectural detail of a modern house: a smooth concrete wall, a wooden slatted panel and the"
                   " shadow of leaves cast by warm late-afternoon sunlight, minimalist composition.",
                   "Detalhe de arquitetura: parede de concreto, painel de ripas de madeira e sombra de folhas ao sol da tarde")
c.reservas = lambda categoria: [RESERVA_SALA, RESERVA_DETALHE]


def esperar_placa():
    """Como a do Balão, mas a rodada do Balão (capa_blog.py) não faz esta sair: ela espera a vez."""
    fim = time.time() + c.ESPERA_DA_PLACA_MIN * 60
    avisado = None
    while True:
        quem = c.placa_ocupada()
        if not quem:
            return True
        if quem == EU:
            c.log("já há outra rodada do banco de matérias em andamento: saindo")
            return False
        if time.time() > fim:
            c.log(f"placa ocupada por {quem} há {c.ESPERA_DA_PLACA_MIN} min: fica para a próxima rodada")
            return False
        if quem != avisado:
            c.log(f"placa ocupada ({quem}): esperando")
            avisado = quem
        time.sleep(60)


c.esperar_placa = esperar_placa


def comando_do_banco(*args):
    """O gerador chama comando_do_blog("capa", slug, foto, "--alt", ...): aqui vai para o banco de matérias."""
    r = c.rodar(["node", "scripts/banco-materias.mjs", *args], espera=600, cwd=str(c.REPO), env=c.ambiente())
    return r.returncode == 0, (r.stdout + r.stderr).strip()[-500:]


c.comando_do_blog = comando_do_banco

if __name__ == "__main__":
    try:
        c.main()
    except Exception as erro:
        c.log(f"ERRO: {erro}")
        sys.exit(1)
