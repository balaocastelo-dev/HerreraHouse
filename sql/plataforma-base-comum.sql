-- Base comum de anúncios (28/10/2026): toda imobiliária da plataforma vê TODOS os anúncios da base (Fisgar/portais).
-- A base mora em base.fisguei_anuncios (e o histórico de preços em base.fisguei_precos). Em cada outra imobiliária,
-- fisguei_anuncios vira uma VIEW dessa base + a tabela fisguei_estado, que guarda o que é só dela:
-- situação do robô (status), pausado, oportunidade e imóvel da carteira ligados, observações.
-- Proprietários, telefones, conversas e buscas no Fisgar (fisguei_pessoas, _contatos, _mensagens, _pedidos) continuam só dela.
-- Escrever na view: dados do anúncio vão para a base comum; o resto vai para fisguei_estado (gatilho INSTEAD OF).
CREATE OR REPLACE FUNCTION plataforma.compartilhar_base(p_slug text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $f$
DECLARE c record; papel text := p_slug || '_app';
  base_cols text := 'id,fisgar_id,portal,link,titulo,tipo,negocio,finalidade,logradouro,numero,complemento,bairro,cidade,uf,cep,lat,lon,valor,valor_condominio,iptu,quartos,suites,banheiros,vagas,area_util,area_total,anunciante_nome,anunciante_tipo,publicado_em,fotos';
BEGIN
  -- O segundo nome é o schema antigo, reservado enquanto a migração (só com OK do dono) não rodou.
  IF p_slug IN ('base', 'ruah') OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = p_slug) THEN RAISE EXCEPTION 'imobiliária inválida'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = p_slug::regnamespace AND relname = 'fisguei_anuncios' AND relkind = 'v') THEN RETURN; END IF; -- já é comum
  -- chaves que apontam para a tabela própria de anúncios saem (os ids passam a ser os da base comum)
  FOR c IN SELECT conname, conrelid::regclass::text t FROM pg_constraint
           WHERE contype = 'f' AND confrelid IN (format('%I.fisguei_anuncios', p_slug)::regclass) AND conrelid <> format('%I.fisguei_precos', p_slug)::regclass LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.t, c.conname);
  END LOOP;
  EXECUTE format('DELETE FROM %I.fisguei_pessoas', p_slug);   -- anúncios próprios antigos (cópias) deixam de existir
  EXECUTE format('DELETE FROM %I.fisguei_pedidos', p_slug);
  EXECUTE format('DROP TABLE %I.fisguei_precos', p_slug);
  EXECUTE format('CREATE VIEW %I.fisguei_precos AS SELECT * FROM base.fisguei_precos', p_slug);
  EXECUTE format('DROP TABLE %I.fisguei_anuncios', p_slug);
  EXECUTE format($q$CREATE TABLE %1$I.fisguei_estado (
      anuncio_id integer PRIMARY KEY REFERENCES base.fisguei_anuncios(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'novo', pausado integer NOT NULL DEFAULT 0,
      oportunidade_id integer REFERENCES %1$I.oportunidades(id) ON DELETE SET NULL,
      imovel_id integer REFERENCES %1$I.imoveis(id) ON DELETE SET NULL,
      observacoes text, atualizado_em text NOT NULL DEFAULT %1$I.agora())$q$, p_slug);
  EXECUTE format('CREATE INDEX ON %I.fisguei_estado(imovel_id)', p_slug);
  EXECUTE format('CREATE INDEX ON %I.fisguei_estado(oportunidade_id)', p_slug);
  EXECUTE format('CREATE INDEX ON %I.fisguei_estado(status)', p_slug);
  EXECUTE format($q$CREATE VIEW %1$I.fisguei_anuncios AS
    SELECT b.id, b.fisgar_id, b.portal, b.link, b.titulo, b.tipo, b.negocio, b.finalidade, b.logradouro, b.numero, b.complemento, b.bairro, b.cidade, b.uf, b.cep,
      b.lat, b.lon, b.valor, b.valor_condominio, b.iptu, b.quartos, b.suites, b.banheiros, b.vagas, b.area_util, b.area_total, b.anunciante_nome, b.anunciante_tipo,
      b.publicado_em, b.fotos,
      coalesce(e.status, CASE WHEN b.status = 'descartado' THEN 'descartado' ELSE 'novo' END) AS status,
      coalesce(e.pausado, 0) AS pausado, e.oportunidade_id, e.observacoes, b.criado_em, greatest(b.atualizado_em, e.atualizado_em) AS atualizado_em,
      e.imovel_id, b.condominio_id, b.cond_checado, b.anunciado_desde, b.aluguel
    FROM base.fisguei_anuncios b LEFT JOIN %1$I.fisguei_estado e ON e.anuncio_id = b.id$q$, p_slug);
  -- gravar na view
  EXECUTE format($q$CREATE FUNCTION %1$I.fisguei_anuncios_grava() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $g$
    DECLARE v integer;
    BEGIN
      IF TG_OP = 'DELETE' THEN DELETE FROM %1$I.fisguei_estado WHERE anuncio_id = OLD.id; RETURN OLD; END IF;
      IF TG_OP = 'INSERT' THEN
        INSERT INTO base.fisguei_anuncios(fisgar_id,portal,link,titulo,tipo,negocio,finalidade,logradouro,numero,complemento,bairro,cidade,uf,cep,lat,lon,valor,valor_condominio,iptu,quartos,suites,banheiros,vagas,area_util,area_total,anunciante_nome,anunciante_tipo,publicado_em,fotos,aluguel,anunciado_desde)
        VALUES (NEW.fisgar_id,NEW.portal,NEW.link,NEW.titulo,NEW.tipo,NEW.negocio,NEW.finalidade,NEW.logradouro,NEW.numero,NEW.complemento,NEW.bairro,NEW.cidade,NEW.uf,NEW.cep,NEW.lat,NEW.lon,NEW.valor,NEW.valor_condominio,NEW.iptu,NEW.quartos,NEW.suites,NEW.banheiros,NEW.vagas,NEW.area_util,NEW.area_total,NEW.anunciante_nome,coalesce(NEW.anunciante_tipo,'desconhecido'),NEW.publicado_em,NEW.fotos,NEW.aluguel,NEW.anunciado_desde)
        ON CONFLICT (fisgar_id) DO UPDATE SET atualizado_em = base.agora() RETURNING id INTO v;
        NEW.id := v;
      ELSE
        v := OLD.id;
        UPDATE base.fisguei_anuncios SET portal = NEW.portal, link = NEW.link, titulo = NEW.titulo, tipo = NEW.tipo, negocio = NEW.negocio, finalidade = NEW.finalidade,
          logradouro = NEW.logradouro, numero = NEW.numero, complemento = NEW.complemento, bairro = NEW.bairro, cidade = NEW.cidade, uf = NEW.uf, cep = NEW.cep, lat = NEW.lat, lon = NEW.lon,
          valor = NEW.valor, valor_condominio = NEW.valor_condominio, iptu = NEW.iptu, quartos = NEW.quartos, suites = NEW.suites, banheiros = NEW.banheiros, vagas = NEW.vagas,
          area_util = NEW.area_util, area_total = NEW.area_total, anunciante_nome = NEW.anunciante_nome, anunciante_tipo = NEW.anunciante_tipo, publicado_em = NEW.publicado_em,
          fotos = NEW.fotos, aluguel = NEW.aluguel, anunciado_desde = NEW.anunciado_desde, condominio_id = NEW.condominio_id, atualizado_em = base.agora()
        WHERE id = v AND (portal, link, titulo, tipo, negocio, finalidade, logradouro, numero, complemento, bairro, cidade, uf, cep, lat, lon, valor, valor_condominio, iptu, quartos, suites, banheiros, vagas,
          area_util, area_total, anunciante_nome, anunciante_tipo, publicado_em, fotos, aluguel, anunciado_desde, condominio_id)
          IS DISTINCT FROM (NEW.portal, NEW.link, NEW.titulo, NEW.tipo, NEW.negocio, NEW.finalidade, NEW.logradouro, NEW.numero, NEW.complemento, NEW.bairro, NEW.cidade, NEW.uf, NEW.cep, NEW.lat, NEW.lon,
          NEW.valor, NEW.valor_condominio, NEW.iptu, NEW.quartos, NEW.suites, NEW.banheiros, NEW.vagas, NEW.area_util, NEW.area_total, NEW.anunciante_nome, NEW.anunciante_tipo, NEW.publicado_em, NEW.fotos,
          NEW.aluguel, NEW.anunciado_desde, NEW.condominio_id);
      END IF;
      IF TG_OP = 'UPDATE' OR coalesce(NEW.status, 'novo') <> 'novo' OR NEW.imovel_id IS NOT NULL OR NEW.oportunidade_id IS NOT NULL OR coalesce(NEW.pausado, 0) <> 0 OR NEW.observacoes IS NOT NULL THEN
        INSERT INTO %1$I.fisguei_estado(anuncio_id, status, pausado, oportunidade_id, imovel_id, observacoes)
        VALUES (v, coalesce(NEW.status, 'novo'), coalesce(NEW.pausado, 0), NEW.oportunidade_id, NEW.imovel_id, NEW.observacoes)
        ON CONFLICT (anuncio_id) DO UPDATE SET status = excluded.status, pausado = excluded.pausado, oportunidade_id = excluded.oportunidade_id,
          imovel_id = excluded.imovel_id, observacoes = excluded.observacoes, atualizado_em = %1$I.agora();
      END IF;
      RETURN NEW;
    END $g$$q$, p_slug);
  EXECUTE format('CREATE TRIGGER fisguei_anuncios_grava INSTEAD OF INSERT OR UPDATE OR DELETE ON %I.fisguei_anuncios FOR EACH ROW EXECUTE FUNCTION %I.fisguei_anuncios_grava()', p_slug, p_slug);
  EXECUTE format('REVOKE ALL ON FUNCTION %I.fisguei_anuncios_grava() FROM PUBLIC', p_slug);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.fisguei_anuncios, %I.fisguei_estado, %I.fisguei_precos TO %I', p_slug, p_slug, p_slug, papel);
  END IF;
END $f$;
REVOKE ALL ON FUNCTION plataforma.compartilhar_base(text) FROM PUBLIC;
