-- =============================================================================
-- Étape 6b : noms de recherche en français des Pokémon asiatiques (JP, KR, TC, SC)
-- Projet : Pkmn-collection — 2026-10-12
--
-- Nom généré = [Méga-/Primo-] + espèce FR + [forme / propriétaire] + [suffixe de carte]
--   ex. ガラル ギャロップV -> « Galopa de Galar V »
--       ヒビキのホウオウex -> « Ho-Oh de Luth-ex »   (comme les noms FR officiels)
--       メガサーナイトex  -> « Méga-Gardevoir-ex »
--
-- Principe : on ne devine jamais. Les morceaux du nom (préfixe, suffixe) sont cherchés dans des
-- dictionnaires. Un morceau inconnu => on garde l'espèce FR seule (méthode « espece_seule »),
-- jamais un nom faux. Tout nom généré est marqué search_name_official = false.
--
-- Nouvelles tables (dictionnaires, modifiables à la main, jamais écrasées par le script) :
--   name_modifiers       : formes, Méga, suffixes (ex, V, GX…) — colonne verified
--   name_owners          : propriétaires (clé japonaise -> complément français) — colonne verified
--   name_owner_aliases   : écriture coréenne / chinoise d'un propriétaire, APPRISE depuis les cartes
--                          déjà rattachées à une famille japonaise (≥ 2 cartes, toujours le même propriétaire)
-- Nouvelle colonne : cards.search_name_method (officiel, energie_base, espece, compose,
--                    multiple, espece_dex, espece_seule).
--
-- Orthographe française des propriétaires : vérifiée dans les noms des cartes FR de la base
-- (verified = true) ; les autres, issues de ma connaissance du jeu, sont à relire (verified = false).
--
-- Annulation : update public.cards set search_name_fr = null, search_name_official = false,
--   search_name_method = null where search_name_method in ('espece','compose','multiple','espece_dex','espece_seule');
--   puis drop des 3 tables et de la fonction generate_search_name_fr.
--
-- VERSION COMMIT : applique les changements (la version sans _COMMIT est le test à blanc).
-- =============================================================================

begin;
set local statement_timeout = '15min';

alter table public.cards add column if not exists search_name_method text;
comment on column public.cards.search_name_method is
  'Comment search_name_fr a été obtenu : officiel, energie_base, espece, compose, multiple, espece_dex, espece_seule.';

update public.cards c set search_name_method = 'officiel'
from public.sets s where s.id = c.set_id and s.language = 'FR' and c.search_name_method is distinct from 'officiel';
update public.cards c set search_name_method = 'energie_base'
from public.sets s where s.id = c.set_id and s.language <> 'FR' and c.category = 'Énergie'
  and c.search_name_fr is not null and c.search_name_method is distinct from 'energie_base';

-- 1. Dictionnaires -----------------------------------------------------------
create table if not exists public.name_modifiers (
  kind text not null check (kind in ('before','after','card')),  -- avant l'espèce / après l'espèce / collé en fin de nom
  raw text not null,                                              -- texte trouvé dans le nom asiatique
  fr text not null,                                               -- texte français (voir exemples ci-dessous)
  verified boolean not null default false,
  note text,
  primary key (kind, raw)
);
create table if not exists public.name_owners (
  key text primary key,                                           -- nom japonais du propriétaire, sans « の »
  fr text not null,                                               -- complément français : « de Luth », « d'Erika »
  verified boolean not null default false
);
create table if not exists public.name_owner_aliases (
  raw text primary key,                                           -- écriture KR / TC / SC normalisée
  owner_key text not null references public.name_owners(key),
  learned_from int not null default 0
);
alter table public.name_modifiers enable row level security;
alter table public.name_owners enable row level security;
alter table public.name_owner_aliases enable row level security;

insert into public.name_modifiers (kind, raw, fr, verified, note) values
 -- avant l'espèce
 ('before','メガ','Méga-',true,'Méga-évolution'),('before','mega','Méga-',true,null),('before','메가','Méga-',true,null),
 ('before','M','Méga-',true,'KR : M리자몽'),('before','超級','Méga-',true,null),('before','超级','Méga-',true,null),
 ('before','ゲンシ','Primo-',true,'Primo-Groudon'),
 -- après l'espèce : formes régionales
 ('after','ガラル','de Galar',true,null),('after','가라르','de Galar',true,null),('after','伽勒尔','de Galar',true,null),('after','伽勒爾','de Galar',true,null),
 ('after','アローラ','d''Alola',true,null),('after','알로라','d''Alola',true,null),('after','阿罗拉','d''Alola',true,null),('after','阿羅拉','d''Alola',true,null),
 ('after','ヒスイ','de Hisui',true,null),('after','히스이','de Hisui',true,null),('after','洗翠','de Hisui',true,null),
 ('after','パルデア','de Paldea',true,null),('after','팔데아','de Paldea',true,null),('after','帕底亚','de Paldea',true,null),('after','帕底亞','de Paldea',true,null),
 -- après l'espèce : variantes
 ('after','わるい','Obscur',true,'Dark'),
 ('after','かがやく','Radieux',true,null),('after','찬란한','Radieux',true,null),('after','光辉','Radieux',true,null),('after','光輝','Radieux',true,null),
 ('after','ひかる','Brillant',false,'Shining'),('after','빛나는','Brillant',false,null),('after','闪耀','Brillant',false,null),
 ('after','ホワイト','Blanc',false,'Kyurem'),('after','화이트','Blanc',false,null),
 ('after','ブラック','Noir',false,'Kyurem'),('after','블랙','Noir',false,null),
 ('after','オリジン','Originel',false,null),('after','오리진','Originel',false,null),('after','起源','Originel',false,null),
 ('after','いちげき','Poing Final',false,'Shifours'),('after','일격','Poing Final',false,null),('after','一击','Poing Final',false,null),('after','一擊','Poing Final',false,null),
 ('after','れんげき','Mille Poings',false,'Shifours'),('after','연격','Mille Poings',false,null),('after','连击','Mille Poings',false,null),('after','連擊','Mille Poings',false,null),
 -- Motisma (formes, vérifiées dans les noms FR)
 ('after','ヒート','Chaleur',true,'Motisma'),('after','ウォッシュ','Lavage',true,'Motisma'),
 ('after','スピン','Hélice',true,'Motisma'),('after','カット','Tonte',true,'Motisma'),
 ('after','フロスト','Froid',true,'Motisma'),
 -- suffixes de carte (collés au nom, comme sur les cartes FR)
 ('card','ex','-ex',true,null),('card','EX','-EX',true,null),('card','GX','-GX',true,null),
 ('card','V',' V',true,null),('card','VMAX',' VMAX',true,null),('card','VSTAR',' VSTAR',true,null),
 ('card','BREAK',' BREAK',true,null),('card','V-UNION',' V-UNION',true,null),
 ('card','Xex',' X-ex',true,'Méga-X-ex'),('card','Yex',' Y-ex',true,null),
 ('card','（デルタ種）',' δ',true,'espèces Delta, comme « Dracaufeu δ » en FR')
on conflict (kind, raw) do nothing;

insert into public.name_owners (key, fr, verified) values
 ('ロケット団','de la Team Rocket',true),('R団','de la Team Rocket',true),('N','de N',true),
 ('エリカ','d''Erika',true),('カスミ','d''Ondine',true),('ホップ','de Nabil',true),('シロナ','de Cynthia',true),
 ('ナンジャモ','de Mashynn',true),('ヒビキ','de Luth',true),('タケシ','de Pierre',true),('リーリエ','de Lilie',true),
 ('ペパー','de Pepper',true),('マリィ','de Rosemary',true),('マグマ団','de la Team Magma',true),
 ('アクア団','de la Team Aqua',true),('アオキ','d''Okuba',true),('サトシ','de Sacha',true),('ランス','de Peter',true),
 ('ナツメ','de Morgane',false),('キョウ','de Koga',false),('カツラ','d''Auguste',false),
 ('サカキ','de Giovanni',false),('マチス','de Major Bob',false),('ダイゴ','de Pierre Rochard',false)
on conflict (key) do nothing;

-- 2. Normalisation d'un préfixe de propriétaire ---------------------------------
create or replace function public.normalize_owner_prefix(p text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(btrim(p), '^<|>$', '', 'g'), '(の|的|의)$', '')
$$;

-- 3. Alias asiatiques APPRIS : même propriétaire, toujours, sur ≥ 2 cartes d'une même famille
create temp table paires on commit drop as
select s.language as lang,
       public.normalize_owner_prefix(substr(c.name, 1, position(
         case s.language when 'KR' then pe.name_ko when 'TC' then pe.name_zh_hant else pe.name_zh_hans end in c.name) - 1)) as raw_asie,
       public.normalize_owner_prefix(substr(a.name, 1, position(pj.name_ja in a.name) - 1)) as cle_jp
from public.cards c
join public.sets s on s.id = c.set_id and s.language in ('KR','TC','SC')
join public.card_entities e on e.id = c.card_entity_id
join public.cards a on a.id = e.anchor_card_id and a.id <> c.id
join public.card_pokemon cp on cp.card_id = c.id and cp.dex_position = 0
join public.pokemon_entities pe on pe.id = cp.pokemon_entity_id
join public.card_pokemon cpj on cpj.card_id = a.id and cpj.dex_position = 0
join public.pokemon_entities pj on pj.id = cpj.pokemon_entity_id and pj.id = pe.id
where c.category = 'Pokémon'
  and position(case s.language when 'KR' then pe.name_ko when 'TC' then pe.name_zh_hant else pe.name_zh_hans end in c.name) > 1
  and position(pj.name_ja in a.name) > 1;

insert into public.name_owner_aliases (raw, owner_key, learned_from)
select raw_asie, min(cle_jp), count(*)
from paires
where cle_jp in (select key from public.name_owners) and raw_asie <> ''
group by raw_asie
having count(distinct cle_jp) = 1 and count(*) >= 2
on conflict (raw) do nothing;

-- Équivalents en chinois simplifié de noms déjà appris en chinois traditionnel (mêmes personnages)
insert into public.name_owner_aliases (raw, owner_key, learned_from) values
 ('火箭队','ロケット団',0),('奇树','ナンジャモ',0),('竹兰','シロナ',0),('赫普','ホップ',0),('派帕','ペパー',0),
 ('玛俐','マリィ',0),('莉莉艾','リーリエ',0),('青木','アオキ',0),('小霞','カスミ',0),('莉佳','エリカ',0)
on conflict (raw) do nothing;

-- 4. Générateur ------------------------------------------------------------------
create or replace function public.generate_search_name_fr(p_name text, p_native text, p_fr text)
returns table (name_fr text, method text)
language plpgsql stable set search_path = public, pg_temp as $$
declare
  pos int; pre text; suf text; v_before text := ''; v_after text := ''; v_card text := '';
  v_key text; v_ok boolean := true;
begin
  if p_fr is null then return; end if;
  pos := case when p_native is null or p_native = '' then 0 else position(p_native in p_name) end;
  if pos = 0 then return query select p_fr, 'espece_dex'::text; return; end if;
  pre := btrim(substr(p_name, 1, pos - 1));
  suf := btrim(substr(p_name, pos + length(p_native)));
  if pre = '' and suf = '' then return query select p_fr, 'espece'::text; return; end if;

  if pre <> '' then
    select m.fr into v_before from name_modifiers m where m.kind = 'before' and m.raw = pre;
    if not found then
      v_before := '';
      select m.fr into v_after from name_modifiers m where m.kind = 'after' and m.raw = pre;
      if not found then
        v_key := public.normalize_owner_prefix(pre);
        select o.fr into v_after from name_owners o where o.key = v_key;
        if not found then
          select o.fr into v_after from name_owner_aliases al join name_owners o on o.key = al.owner_key where al.raw = v_key;
          if not found then v_ok := false; end if;
        end if;
      end if;
    end if;
  end if;

  if v_ok and suf <> '' then
    select m.fr into v_card from name_modifiers m where m.kind = 'card' and m.raw = suf;
    if not found then v_ok := false; end if;
  end if;

  if v_ok then
    return query select v_before || p_fr || case when v_after <> '' then ' ' || v_after else '' end || v_card, 'compose'::text;
  else
    return query select p_fr, 'espece_seule'::text;
  end if;
end $$;

-- 5. Application -----------------------------------------------------------------
-- 5a. cartes à une seule espèce
create temp table generes on commit drop as
select c.id as card_id, g.name_fr, g.method
from public.cards c
join public.sets s on s.id = c.set_id and s.language in ('JP','KR','TC','SC')
join public.card_pokemon cp on cp.card_id = c.id and cp.dex_position = 0
join public.pokemon_entities pe on pe.id = cp.pokemon_entity_id
cross join lateral public.generate_search_name_fr(
  c.name,
  case s.language when 'JP' then pe.name_ja when 'KR' then pe.name_ko when 'TC' then pe.name_zh_hant else pe.name_zh_hans end,
  pe.name_fr) g
where c.category = 'Pokémon'
  and not exists (select 1 from public.card_pokemon x where x.card_id = c.id and x.dex_position > 0);

-- 5b. cartes à plusieurs espèces (Pikachu & Zekrom-GX…) : « A et B » + suffixe de carte reconnu
insert into generes
select c.id,
       string_agg(pe.name_fr, ' et ' order by cp.dex_position)
         || coalesce((select m.fr from public.name_modifiers m
                      where m.kind = 'card' and m.raw = (regexp_match(c.name, '(VMAX|VSTAR|GX|EX|ex|V)$'))[1]), ''),
       'multiple'
from public.cards c
join public.sets s on s.id = c.set_id and s.language in ('JP','KR','TC','SC')
join public.card_pokemon cp on cp.card_id = c.id
join public.pokemon_entities pe on pe.id = cp.pokemon_entity_id
where c.category = 'Pokémon'
  and exists (select 1 from public.card_pokemon x where x.card_id = c.id and x.dex_position > 0)
group by c.id, c.name
having bool_and(pe.name_fr is not null);

update public.cards c
set search_name_fr = g.name_fr, search_name_official = false, search_name_method = g.method
from generes g
where c.id = g.card_id
  and (c.search_name_fr is distinct from g.name_fr or c.search_name_method is distinct from g.method);

-- 6. Rapport -----------------------------------------------------------------------
create temp table rapport (ordre int, controle text, n bigint) on commit drop;
insert into rapport
select 1, 'alias asiatiques appris', count(*) from public.name_owner_aliases
union all
select 2, 'cartes Pokémon asiatiques sans nom de recherche (attendu : celles sans espèce)', count(*)
from public.cards c join public.sets s on s.id = c.set_id
where s.language <> 'FR' and c.category = 'Pokémon' and c.search_name_fr is null
union all
select 10 + row_number() over (order by s.language, c.search_name_method),
       'Pokémon ' || s.language || ' — ' || coalesce(c.search_name_method, 'sans nom'), count(*)
from public.cards c join public.sets s on s.id = c.set_id
where s.language <> 'FR' and c.category = 'Pokémon'
group by s.language, c.search_name_method;

select * from rapport order by ordre;

commit;
