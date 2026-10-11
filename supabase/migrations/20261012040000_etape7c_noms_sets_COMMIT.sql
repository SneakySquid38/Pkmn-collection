-- =============================================================================
-- Étape 7c : noms de sets par langue (`set_translations`)
-- Projet : Pkmn-collection — 2026-10-12
--
-- Constat (lecture seule) : FR, KR, TC et SC ont déjà un nom dans leur langue pour chaque set.
-- Côté JP, 195 sets sur 360 n'ont pour nom que leur code.
--
-- Cette étape :
--   1. crée `set_translations (set_id, language, name, source, is_official)` : un nom par set et par
--      langue (fr, ja, ko, zh-tw, zh-cn, en). Lecture publique limitée aux sets publiés (comme `sets`).
--   2. y range le nom propre de chaque set dans sa langue (source `import`).
--   3. ajoute les noms TCGdex (source `tcgdex`) : 6 noms japonais manquants (DP2, DP3, DS, SC, WCS23, XY),
--      qui deviennent aussi `sets.name`, et 100 noms coréens de sets JP. Les codes KR/TC de TCGdex ne
--      sont volontairement PAS utilisés : ils ne correspondent pas aux nôtres (ex. bw1b).
--   4. donne aux sets JP le nom (ko / zh-tw / zh-cn) de leur équivalent aligné, seulement quand il n'y en a
--      qu'un seul dans la langue (source `aligned`). Ce sont des noms de produits équivalents, pas des
--      traductions : `is_official` reste vrai pour le nom du produit, la source dit d'où il vient.
--   5. recalcule `search_text` des cartes des 6 sets renommés.
--
-- Aucune traduction française inventée : les noms français des sets asiatiques se saisissent à la main
-- (`language = 'fr'`, `source = 'manual'`, `is_official = false` s'il s'agit d'une traduction libre).
--
-- `apply_set_translations()` refait les étapes 2 et 4 (relançable à chaque import).
--
-- Annulation : drop table public.set_translations; drop function public.apply_set_translations();
--   update public.sets set name = code where language = 'JP' and code in ('DP2','DP3','DS','SC','WCS23','XY');
--   puis select public.refresh_search_text(array(select c.id from cards c join sets s on s.id = c.set_id
--     where s.language = 'JP' and s.code in ('DP2','DP3','DS','SC','WCS23','XY')));
--
-- VERSION COMMIT : les modifications sont enregistrées (dernière ligne « commit »).
-- Test à blanc validé : 6 sets JP renommés, 1 303 lignes de traduction (voir le rapport).
-- =============================================================================

begin;
set local statement_timeout = '15min';

create table if not exists public.set_translations (
  set_id      uuid not null references public.sets(id) on delete cascade,
  language    text not null check (language in ('fr','ja','ko','zh-tw','zh-cn','en')),
  name        text not null check (length(btrim(name)) > 0),
  source      text not null check (source in ('import','tcgdex','aligned','manual')),
  is_official boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (set_id, language)
);
alter table public.set_translations enable row level security;
create policy "Lecture publique des noms de sets publiés" on public.set_translations
  for select using (exists (select 1 from public.sets s where s.id = set_id and s.is_published));

create or replace function public.apply_set_translations()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare n1 integer; n2 integer;
begin
  -- nom propre de chaque set dans sa langue
  insert into set_translations (set_id, language, name, source)
  select s.id,
         case s.language when 'FR' then 'fr' when 'JP' then 'ja' when 'KR' then 'ko'
                         when 'TC' then 'zh-tw' when 'SC' then 'zh-cn' end,
         btrim(s.name), 'import'
  from sets s
  where btrim(s.name) <> '' and s.name <> coalesce(s.code, '')
  on conflict (set_id, language) do nothing;
  get diagnostics n1 = row_count;

  -- sets JP : nom de l'équivalent KR / TC / SC quand il est unique dans la langue
  insert into set_translations (set_id, language, name, source)
  select a.jp_set_id, l.lang, min(btrim(s.name)), 'aligned'
  from set_alignments a
  join sets s on s.id = a.set_id
  join (values ('KR','ko'), ('TC','zh-tw'), ('SC','zh-cn')) as l(language, lang) on l.language = s.language
  join sets jp on jp.id = a.jp_set_id and jp.language = 'JP'
  where btrim(s.name) <> ''
  group by a.jp_set_id, l.lang
  having count(distinct s.id) = 1
  on conflict (set_id, language) do nothing;
  get diagnostics n2 = row_count;

  return n1 + n2;
end $$;
revoke execute on function public.apply_set_translations() from public, anon, authenticated;

create temp table rapport (ordre int, controle text, n bigint) on commit drop;

-- 1. noms TCGdex d'abord (ja pour les sets JP sans nom, ko pour les sets JP) : source prioritaire
create temp table tcgdex_names (language text, code text, lang text, name text) on commit drop;
insert into tcgdex_names values
  ('JP','CP1','ko','마그마단vs아쿠아단 더블크라이시스'),
  ('JP','CP2','ko','레전드 컬렉션'),
  ('JP','CP3','ko','포켓심쿵 컬렉션'),
  ('JP','CP4','ko','프리미엄 챔피언팩'),
  ('JP','CP5','ko','냉혹한 반역자'),
  ('JP','CP6','ko','BASE PACK 20th Anniversary'),
  ('JP','DP2','ja','湖の秘密'),
  ('JP','DP3','ja','ひかる闇'),
  ('JP','DS','ja','ドラゴンセレクション'),
  ('JP','DS','ko','드래곤 컬렉션'),
  ('JP','S10a','ko','다크판타스마'),
  ('JP','S10b','ko','Pokémon GO'),
  ('JP','S10D','ko','타임게이저'),
  ('JP','S10P','ko','스페이스저글러'),
  ('JP','S11','ko','트리플렛비트'),
  ('JP','S11a','ko','백열의 아르카나'),
  ('JP','S12','ko','패러다임트리거'),
  ('JP','S12a','ko','VSTAR 유니버스'),
  ('JP','S1a','ko','VMAX라이징'),
  ('JP','S1H','ko','실드'),
  ('JP','S1W','ko','소드'),
  ('JP','S2','ko','반역크래시'),
  ('JP','S2a','ko','폭염워커'),
  ('JP','S3','ko','무한존'),
  ('JP','S3a','ko','전설의 고동'),
  ('JP','S4','ko','앙천의 볼트태클'),
  ('JP','S4a','ko','샤이니스타V'),
  ('JP','S5a','ko','쌍벽의 파이터'),
  ('JP','S5I','ko','일격마스터'),
  ('JP','S5R','ko','연격마스터'),
  ('JP','S6a','ko','이브이 히어로즈'),
  ('JP','S6H','ko','백은의 랜스'),
  ('JP','S6K','ko','칠흑의 가이스트'),
  ('JP','S7D','ko','마천퍼펙트'),
  ('JP','S7R','ko','창공의스트림'),
  ('JP','S8','ko','퓨전아츠'),
  ('JP','S8a','ko','25th Anniversary'),
  ('JP','S8b','ko','VMAX 클라이맥스'),
  ('JP','S9','ko','스타버스'),
  ('JP','S9a','ko','배틀리전'),
  ('JP','SC','ja','シャイニーコレクション'),
  ('JP','SC','ko','샤이니 컬렉션'),
  ('JP','SM10','ko','더블블레이즈'),
  ('JP','SM10a','ko','GG엔드'),
  ('JP','SM10b','ko','스카이레전드'),
  ('JP','SM11','ko','미라클트윈'),
  ('JP','SM11a','ko','리믹스바우트'),
  ('JP','SM11b','ko','드림리그'),
  ('JP','SM12','ko','얼터제네시스'),
  ('JP','SM12a','ko','TAG TEAM GX 태그올스타즈'),
  ('JP','SM1M','ko','문 컬렉션'),
  ('JP','SM1S','ko','썬 컬렉션'),
  ('JP','SM2K','ko','알로라의 햇빛'),
  ('JP','SM2L','ko','알로라의 달빛'),
  ('JP','SM3H','ko','어둠을 밝힌 무지개'),
  ('JP','SM3N','ko','빛을 삼킨 어둠'),
  ('JP','SM4A','ko','초차원의 침략자'),
  ('JP','SM4S','ko','각성의 용사'),
  ('JP','SM5M','ko','울트라문'),
  ('JP','SM5S','ko','울트라썬'),
  ('JP','SM6','ko','금단의 빛'),
  ('JP','SM6a','ko','드래곤스톰'),
  ('JP','SM6b','ko','챔피언로드'),
  ('JP','SM7','ko','창공의 카리스마'),
  ('JP','SM7a','ko','플라스마 스파크'),
  ('JP','SM7b','ko','페어리라이즈'),
  ('JP','SM8','ko','버스트임팩트'),
  ('JP','SM8a','ko','다크오더'),
  ('JP','SM8b','ko','GX 울트라샤이니 ULTIMATE'),
  ('JP','SM9','ko','태그볼트'),
  ('JP','SM9a','ko','나이트유니슨'),
  ('JP','SM9b','ko','풀메탈월'),
  ('JP','SMP2','ko','명탐정 피카츄'),
  ('JP','SV1a','ko','트리플렛비트'),
  ('JP','SV1S','ko','스칼렛ex'),
  ('JP','SV1V','ko','바이올렛ex'),
  ('JP','SV2a','ko','포켓몬 카드 151'),
  ('JP','SV2D','ko','클레이버스트'),
  ('JP','SV2P','ko','스노해저드'),
  ('JP','SV3','ko','흑염의 지배자'),
  ('JP','SV3a','ko','레이징서프'),
  ('JP','SV4a','ko','샤이니트레저 ex'),
  ('JP','SV4K','ko','고대의 포효'),
  ('JP','SV4M','ko','미래의 일섬'),
  ('JP','SV5a','ko','크림슨헤이즈'),
  ('JP','SV5K','ko','와일드포스'),
  ('JP','SV5M','ko','사이버저지'),
  ('JP','SV6','ko','변환의 가면'),
  ('JP','WCS23','ja','ポケモンワールドチャンピオンシップス2023横浜 記念デッキ「ピカチュウ」'),
  ('JP','XY','ja','THE BEST OF XY'),
  ('JP','XY','ko','THE BEST OF XY'),
  ('JP','XY10','ko','초능력의 제왕'),
  ('JP','XY11a','ko','타오르는 투사'),
  ('JP','XY11b','ko','냉혹한 반역자'),
  ('JP','XY1a','ko','X컬렉션'),
  ('JP','XY1b','ko','Y컬렉션'),
  ('JP','XY2','ko','와일드 블레이즈'),
  ('JP','XY3','ko','라이징피스트'),
  ('JP','XY4','ko','팬텀게이트'),
  ('JP','XY5a','ko','가이아 볼케이노'),
  ('JP','XY5b','ko','타이달스톰'),
  ('JP','XY6','ko','마그마단vs아쿠아단 더블크라이시스'),
  ('JP','XY7','ko','밴디트링'),
  ('JP','XY8a','ko','푸른 충격'),
  ('JP','XY8b','ko','붉은 섬광 충격'),
  ('JP','XY9','ko','천공의 분노');

with ins as (
  insert into set_translations (set_id, language, name, source)
  select s.id, t.lang, t.name, 'tcgdex'
  from tcgdex_names t join sets s on s.language = t.language and s.code = t.code
  on conflict (set_id, language) do nothing
  returning set_id, language
)
insert into rapport select 2, 'noms TCGdex ajoutés (' || language || ')', count(*) from ins group by language;

-- sets JP dont le nom était le code : prennent le nom japonais TCGdex
create temp table renommes on commit drop as
select s.id, s.code, t.name as nouveau
from sets s join tcgdex_names t on t.language = s.language and t.code = s.code and t.lang = 'ja'
where s.language = 'JP' and s.name = s.code;
update sets s set name = r.nouveau from renommes r where r.id = s.id;
insert into rapport select 3, 'sets JP renommés d''après TCGdex', count(*) from renommes;

-- 2. noms propres de chaque set, puis noms ko / zh-tw / zh-cn alignés (après TCGdex)
select public.apply_set_translations();

-- 3. texte de recherche des cartes des sets renommés
select public.refresh_search_text(array(select c.id from cards c where c.set_id in (select id from renommes)));

-- Rapport
insert into rapport
select 10 + row_number() over (order by language, source), language || ' / ' || source, count(*)
from set_translations group by language, source;

insert into rapport
select 60, 'sets JP dont le nom est encore le code', count(*) from sets where language = 'JP' and name = code
union all
select 61, 'dont avec au moins un nom ko / zh équivalent', count(*) from sets s where s.language = 'JP' and s.name = s.code
  and exists (select 1 from set_translations t where t.set_id = s.id and t.language in ('ko','zh-tw','zh-cn'))
union all
select 62, 'sets (toutes langues) sans aucun nom dans set_translations', count(*) from sets s where not exists (select 1 from set_translations t where t.set_id = s.id)
union all
select 63, 'cartes des sets renommés au search_text recalculé', count(*) from cards where set_id in (select id from renommes)
union all
select 64, 'fonction appelable par anon/authenticated (attendu 0)', count(*) from information_schema.role_routine_grants
  where routine_name = 'apply_set_translations' and grantee in ('anon','authenticated','PUBLIC');

select * from rapport order by ordre;

commit;
