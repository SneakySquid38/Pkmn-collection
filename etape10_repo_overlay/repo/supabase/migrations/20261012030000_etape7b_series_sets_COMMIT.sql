-- =============================================================================
-- Étape 7b : séries des sets (series_id + series texte français)
-- Projet : Pkmn-collection — 2026-10-12
--
-- Constat : JP 195 sets sans série, KR 264, TC 134, SC 35 ; `sets.series` (texte) vide
-- partout sauf FR.
--
-- Méthode, par ordre de priorité (une série déjà renseignée n'est jamais modifiée) :
--   1. table `set_series_map (language, code)` : classement explicite et auditable, avec la
--      source de chaque choix :
--        prefixe     le code du set porte l'ère (BW1-B…, DPt2-S…, XY…, SM…, SV…, M…)
--        date        la date de sortie place le set dans une ère
--        cartes      le contenu des cartes l'établit (V/VMAX, EX, BREAK, Pokémon de 5e génération…)
--        nom_du_set  le nom du set (KR/TC/SC) nomme l'ère : BW, DP, XY, 썬&문, 劍&盾, 朱&紫…
--        a_verifier  époque non déterminable : rangé en « Autre », à classer à la main
--   2. KR / TC / SC sans série : celle du set JP aligné (set_alignments)
--   3. `sets.series` (texte) = nom français de l'ère
--
-- Corrections d'après la lecture des cartes : les sets HS* (starters de 5e génération) sont
-- Noir & Blanc, et SNPo / SNPr (cartes BREAK) sont XY, contrairement à ce que leur code laisse croire.
--
-- Pour compléter ou corriger : modifier / ajouter une ligne dans `set_series_map`, puis
--   update public.sets set series_id = null where language = '…' and code = '…';
--   select public.apply_set_series();
--
-- Annulation : update public.sets s set series_id = null, series = null
--   where s.language <> 'FR' and s.series_id is not null
--     and s.id not in (select id from sets where language = 'JP' and code in (…165 sets classés avant 7b…));
--   (plus simple : restaurer la sauvegarde de la table sets) ; puis
--   drop table public.set_series_map; drop function public.apply_set_series();
--
-- VERSION COMMIT : les modifications sont enregistrées (dernière ligne « commit »).
-- Test à blanc validé : 0 set sans série, 30 sets « Autre », 0 désaccord nom/série.
-- =============================================================================

begin;
set local statement_timeout = '15min';

create table if not exists public.set_series_map (
  language  text not null check (language in ('FR','JP','KR','TC','SC')),
  code      text not null,
  series_id text not null references public.series(code),
  source    text not null check (source in ('prefixe','date','cartes','nom_du_set','a_verifier','manual')),
  note      text,
  primary key (language, code)
);
alter table public.set_series_map enable row level security;

insert into public.set_series_map (language, code, series_id, source, note) values
  ('JP','20th','xy','cartes','Pokémon-EX / 6e génération'),
  ('JP','Bb','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','Bd','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','BGSt','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','BGSv','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','Bk','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','BKB','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','BKc','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','BKR','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','BKt','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','BKv','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','BKW','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','BKZ','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','Br','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','BTV','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','BW','bw','prefixe','code BW'),
  ('JP','BW1-Bb','bw','prefixe','code BW'),
  ('JP','BW1-Bw','bw','prefixe','code BW'),
  ('JP','BW10-B','bw','prefixe','code BW'),
  ('JP','BW2-B','bw','prefixe','code BW'),
  ('JP','BW3-Bh','bw','prefixe','code BW'),
  ('JP','BW3-Bp','bw','prefixe','code BW'),
  ('JP','BW4-B','bw','prefixe','code BW'),
  ('JP','BW5-Brn','bw','prefixe','code BW'),
  ('JP','BW5-Brz','bw','prefixe','code BW'),
  ('JP','BW6-Bc','bw','prefixe','code BW'),
  ('JP','BW6-Bf','bw','prefixe','code BW'),
  ('JP','BW7-B','bw','prefixe','code BW'),
  ('JP','BW8-Brf','bw','prefixe','code BW'),
  ('JP','BW8-Brn','bw','prefixe','code BW'),
  ('JP','BW9-B','bw','prefixe','code BW'),
  ('JP','BWP','bw','prefixe','code BW'),
  ('JP','CLF','sv','prefixe','code SV, 2023-2025'),
  ('JP','CLK','sv','prefixe','code SV, 2023-2025'),
  ('JP','CLL','sv','prefixe','code SV, 2023-2025'),
  ('JP','CPm','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','CPr','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','CPs','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','CS1m','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','CS1p','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','CS1t','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','DP1','dp','prefixe','code DP'),
  ('JP','DP2','dp','prefixe','code DP'),
  ('JP','DP3','dp','prefixe','code DP'),
  ('JP','DP4','dp','prefixe','code DP'),
  ('JP','DP5','dp','prefixe','code DP'),
  ('JP','DPP','dp','prefixe','code DP'),
  ('JP','DPs-B','dp','prefixe','code DP'),
  ('JP','DPs-Sd','dp','prefixe','code DP'),
  ('JP','DPs-Sg','dp','prefixe','code DP'),
  ('JP','DPt-EPd','platine','prefixe','code DPt'),
  ('JP','DPt-EPg','platine','prefixe','code DPt'),
  ('JP','DPt-EPp','platine','prefixe','code DPt'),
  ('JP','DPt-GBhi','platine','prefixe','code DPt'),
  ('JP','DPt-GBna','platine','prefixe','code DPt'),
  ('JP','DPt-GBpi','platine','prefixe','code DPt'),
  ('JP','DPt-GBpo','platine','prefixe','code DPt'),
  ('JP','DPt-MRP09','platine','prefixe','code DPt'),
  ('JP','DPt1-B','platine','prefixe','code DPt'),
  ('JP','DPt2-B','platine','prefixe','code DPt'),
  ('JP','DPt2-Se','platine','prefixe','code DPt'),
  ('JP','DPt2-Sg','platine','prefixe','code DPt'),
  ('JP','DPt3-B','platine','prefixe','code DPt'),
  ('JP','DPt3-Sg','platine','prefixe','code DPt'),
  ('JP','DPt3-Sl','platine','prefixe','code DPt'),
  ('JP','DPt4-B','platine','prefixe','code DPt'),
  ('JP','DPt4-Sgf','platine','prefixe','code DPt'),
  ('JP','DPt4-Slp','platine','prefixe','code DPt'),
  ('JP','DPtP','platine','prefixe','code DPt'),
  ('JP','DS','bw','prefixe','code BW'),
  ('JP','El','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','Em','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','EP08','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','GBR','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','HSm','bw','cartes','starters de 5e génération (pas HGSS)'),
  ('JP','HSp','bw','cartes','starters de 5e génération (pas HGSS)'),
  ('JP','HSPm','bw','cartes','starters de 5e génération (pas HGSS)'),
  ('JP','HSPp','bw','cartes','starters de 5e génération (pas HGSS)'),
  ('JP','HSPt','bw','cartes','starters de 5e génération (pas HGSS)'),
  ('JP','HSt','bw','cartes','starters de 5e génération (pas HGSS)'),
  ('JP','HSZm','bw','cartes','starters de 5e génération (pas HGSS)'),
  ('JP','HSZp','bw','cartes','starters de 5e génération (pas HGSS)'),
  ('JP','HSZt','bw','cartes','starters de 5e génération (pas HGSS)'),
  ('JP','HXY','xy','cartes','Pokémon-EX / 6e génération'),
  ('JP','KK','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','KLD','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','L2-Sb','hgss','cartes','code L, 2e/3e génération'),
  ('JP','L2-Sh','hgss','cartes','code L, 2e/3e génération'),
  ('JP','LP','hgss','cartes','code L, 2e/3e génération'),
  ('JP','MA','me','prefixe','code M, 2025-2026'),
  ('JP','MBD','me','prefixe','code M, 2025-2026'),
  ('JP','MBG','me','prefixe','code M, 2025-2026'),
  ('JP','MDB','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','MEE','me','prefixe','code M, 2025-2026'),
  ('JP','MEM','me','prefixe','code M, 2025-2026'),
  ('JP','MEZ','me','prefixe','code M, 2025-2026'),
  ('JP','MG','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','MMB-P','xy','cartes','EX de 6e génération ou BREAK'),
  ('JP','MMB-S','xy','cartes','EX de 6e génération ou BREAK'),
  ('JP','MP1','me','prefixe','code M, 2025-2026'),
  ('JP','MPS','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','MPS08','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','no_set','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','PBG','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','PPD','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','PPP','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','PW','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','Ran','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','S-P','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','S8a-G','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','S8a-P','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SA','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SB','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SC','bw','prefixe','code BW'),
  ('JP','SC2','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SCS','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SD','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SEF','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SEK','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SF','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SGG','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SGI','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SH','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SI','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SJ','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SK','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SLD','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SLL','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SM-XY','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','SMA','sm','prefixe','code SM'),
  ('JP','SMB','sm','prefixe','code SM'),
  ('JP','SMC','sm','prefixe','code SM'),
  ('JP','SMD','sm','prefixe','code SM'),
  ('JP','SME','sm','prefixe','code SM'),
  ('JP','SMF','sm','prefixe','code SM'),
  ('JP','SMG','sm','prefixe','code SM'),
  ('JP','SMH','sm','prefixe','code SM'),
  ('JP','SMI','sm','prefixe','code SM'),
  ('JP','SMJ','sm','prefixe','code SM'),
  ('JP','SMK','sm','prefixe','code SM'),
  ('JP','SML','sm','prefixe','code SM'),
  ('JP','SMM','sm','prefixe','code SM'),
  ('JP','SMN','sm','prefixe','code SM'),
  ('JP','SMP','sm','prefixe','code SM'),
  ('JP','SMP1','sm','prefixe','code SM'),
  ('JP','SN','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SNPo','xy','cartes','EX de 6e génération ou BREAK'),
  ('JP','SNPr','xy','cartes','EX de 6e génération ou BREAK'),
  ('JP','SO','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SP1','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SP2','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SP3','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SP4','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SP5','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SP6','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SPD','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SPZ','swsh','cartes','cartes V / VMAX / VSTAR, code S'),
  ('JP','SVAL','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVAM','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVAW','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVB','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVC','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVD','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVEL','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVEM','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVF','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVG','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVHK','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVHM','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVI','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVJL','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVJP','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVM','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVN','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVOD','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVOM','sv','prefixe','code SV, 2023-2025'),
  ('JP','SVP1','sv','prefixe','code SV, 2023-2025'),
  ('JP','SZD','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','WAK','bw','cartes','Pokémon de 5e génération / EX'),
  ('JP','WCP','autre','a_verifier','époque indéterminée : à classer à la main'),
  ('JP','WCS23','sv','prefixe','code SV, 2023-2025'),
  ('JP','X30','xy','cartes','Pokémon-EX / 6e génération'),
  ('JP','XY','xy','prefixe','compilation THE BEST OF XY (2017)'),
  ('JP','XY6-B','xy','prefixe','code XY'),
  ('JP','XY7-B','xy','prefixe','code XY'),
  ('JP','XYA','xy','prefixe','code XY'),
  ('JP','XYB','xy','prefixe','code XY'),
  ('JP','XYC','xy','prefixe','code XY'),
  ('JP','XYD','xy','prefixe','code XY'),
  ('JP','XYE','xy','prefixe','code XY'),
  ('JP','XYF','xy','prefixe','code XY'),
  ('JP','XYG','xy','prefixe','code XY'),
  ('JP','XYH','xy','prefixe','code XY'),
  ('JP','XYP','xy','prefixe','code XY'),
  ('JP','Y30','xy','cartes','Pokémon-EX / 6e génération'),
  ('KR','bd','bw','nom_du_set','nom du set : BW'),
  ('KR','bs1','dp','nom_du_set','nom du set : DP'),
  ('KR','bs10','dp','nom_du_set','nom du set : DP'),
  ('KR','bs2','dp','nom_du_set','nom du set : DP'),
  ('KR','bs3','dp','nom_du_set','nom du set : DP'),
  ('KR','bs4','dp','nom_du_set','nom du set : DP'),
  ('KR','bs5','dp','nom_du_set','nom du set : DP'),
  ('KR','bs6','dp','nom_du_set','nom du set : DP'),
  ('KR','bs7','dp','nom_du_set','nom du set : DP'),
  ('KR','bs8','dp','nom_du_set','nom du set : DP'),
  ('KR','bs9','dp','nom_du_set','nom du set : DP'),
  ('KR','bw9','bw','nom_du_set','nom du set : BW'),
  ('KR','dppromo','autre','a_verifier','promos de plusieurs ères : à classer à la main'),
  ('KR','fsb','bw','nom_du_set','nom du set : BW'),
  ('KR','fsg','bw','nom_du_set','nom du set : BW'),
  ('KR','fsr','bw','nom_du_set','nom du set : BW'),
  ('KR','no_set','sv','nom_du_set','nom du set : 스칼렛&바이올렛'),
  ('KR','none','bw','nom_du_set','nom du set : BW'),
  ('KR','promo','autre','a_verifier','promos de plusieurs ères : à classer à la main'),
  ('KR','pss','bw','nom_du_set','nom du set : BW'),
  ('KR','rbd','xy','nom_du_set','nom du set : XY'),
  ('KR','SC_R','swsh','nom_du_set','nom du set : 소드&실드'),
  ('KR','SD','swsh','nom_du_set','nom du set : 소드&실드'),
  ('KR','SM30A','sm','nom_du_set','nom du set : 썬&문'),
  ('KR','sm60b','sm','nom_du_set','nom du set : 썬&문'),
  ('KR','SMN','sm','nom_du_set','nom du set : 썬&문'),
  ('KR','smxy','xy','nom_du_set','nom du set : XY'),
  ('KR','st1','dp','nom_du_set','nom du set : DP'),
  ('KR','st2','dp','nom_du_set','nom du set : DP'),
  ('KR','st2d','dp','nom_du_set','nom du set : DP'),
  ('KR','st2p','dp','nom_du_set','nom du set : DP'),
  ('KR','st3','dp','nom_du_set','nom du set : DP'),
  ('KR','st3c','dp','nom_du_set','nom du set : DP'),
  ('KR','st3d','dp','nom_du_set','nom du set : DP'),
  ('KR','SVP2','sv','nom_du_set','nom du set : 스칼렛&바이올렛'),
  ('KR','td','bw','nom_du_set','nom du set : BW'),
  ('KR','ubd','xy','nom_du_set','nom du set : XY'),
  ('KR','xy11b','xy','nom_du_set','nom du set : XY'),
  ('KR','xy6','xy','nom_du_set','nom du set : XY'),
  ('KR','xy7','xy','nom_du_set','nom du set : XY'),
  ('KR','xy8b','xy','nom_du_set','nom du set : XY'),
  ('KR','xyf','xy','nom_du_set','nom du set : XY'),
  ('TC','AC1a','sm','nom_du_set','nom du set : 太陽&月亮 / GX'),
  ('TC','AC1b','sm','nom_du_set','nom du set : 太陽&月亮 / GX'),
  ('TC','AC1D','sm','nom_du_set','nom du set : 太陽&月亮 / GX'),
  ('TC','AC2a','sm','nom_du_set','nom du set : 太陽&月亮 / GX'),
  ('TC','AC2b','sm','nom_du_set','nom du set : 太陽&月亮 / GX'),
  ('TC','AC2D','sm','nom_du_set','nom du set : 太陽&月亮 / GX'),
  ('TC','AS5a','sm','nom_du_set','nom du set : 太陽&月亮 / GX'),
  ('TC','AS5b','sm','nom_du_set','nom du set : 太陽&月亮 / GX'),
  ('TC','AS5D','sm','nom_du_set','nom du set : 太陽&月亮 / GX'),
  ('TC','AS6a','sm','nom_du_set','nom du set : 太陽&月亮 / GX'),
  ('TC','AS6b','sm','nom_du_set','nom du set : 太陽&月亮 / GX'),
  ('TC','AS6Dout','sm','nom_du_set','nom du set : 太陽&月亮 / GX'),
  ('TC','M-P','me','nom_du_set','nom du set : 超級…ex'),
  ('TC','MBD','me','nom_du_set','nom du set : 超級…ex'),
  ('TC','MJ','me','nom_du_set','nom du set : 超級…ex'),
  ('TC','MTH','me','nom_du_set','nom du set : 超級…ex'),
  ('TC','MTK','me','nom_du_set','nom du set : 超級…ex'),
  ('TC','MTL','me','nom_du_set','nom du set : 超級…ex'),
  ('TC','MTS','me','nom_du_set','nom du set : 超級…ex'),
  ('TC','S-P','swsh','nom_du_set','nom du set : 劍&盾 / V起始牌組'),
  ('TC','SC1A','swsh','nom_du_set','nom du set : 劍&盾 / V起始牌組'),
  ('TC','SC1B','swsh','nom_du_set','nom du set : 劍&盾 / V起始牌組'),
  ('TC','SC1D','swsh','nom_du_set','nom du set : 劍&盾 / V起始牌組'),
  ('TC','SC2A','swsh','nom_du_set','nom du set : 劍&盾 / V起始牌組'),
  ('TC','SC2B','swsh','nom_du_set','nom du set : 劍&盾 / V起始牌組'),
  ('TC','SC2D','swsh','nom_du_set','nom du set : 劍&盾 / V起始牌組'),
  ('TC','SCA','swsh','nom_du_set','nom du set : 劍&盾 / V起始牌組'),
  ('TC','SCB','swsh','nom_du_set','nom du set : 劍&盾 / V起始牌組'),
  ('TC','SCC','swsh','nom_du_set','nom du set : 劍&盾 / V起始牌組'),
  ('TC','SCD','swsh','nom_du_set','nom du set : 劍&盾 / V起始牌組'),
  ('TC','SDL','swsh','nom_du_set','nom du set : 劍&盾 / V起始牌組'),
  ('TC','SDM','swsh','nom_du_set','nom du set : 劍&盾 / V起始牌組'),
  ('TC','SDP','swsh','nom_du_set','nom du set : 劍&盾 / V起始牌組'),
  ('TC','SM-P','sm','nom_du_set','nom du set : 太陽&月亮 / GX'),
  ('TC','SV-P','sv','nom_du_set','nom du set : 朱&紫 / ex'),
  ('TC','SVHM','sv','nom_du_set','nom du set : 朱&紫 / ex'),
  ('TC','SVK','sv','nom_du_set','nom du set : 朱&紫 / ex'),
  ('TC','SVO','sv','nom_du_set','nom du set : 朱&紫 / ex'),
  ('TC','SVQL','sv','nom_du_set','nom du set : 朱&紫 / ex'),
  ('TC','SVQP','sv','nom_du_set','nom du set : 朱&紫 / ex'),
  ('TC','SVTG','sv','nom_du_set','nom du set : 朱&紫 / ex'),
  ('TC','SVTH','sv','nom_du_set','nom du set : 朱&紫 / ex'),
  ('TC','SVTM','sv','nom_du_set','nom du set : 朱&紫 / ex'),
  ('TC','SVTR','sv','nom_du_set','nom du set : 朱&紫 / ex'),
  ('TC','SVTS','sv','nom_du_set','nom du set : 朱&紫 / ex'),
  ('SC','30th-P-01','me','date','sortie depuis juillet 2025'),
  ('SC','30th-P-02','me','date','sortie depuis juillet 2025'),
  ('SC','30th-P-03','me','date','sortie depuis juillet 2025'),
  ('SC','30thC','me','date','sortie depuis juillet 2025'),
  ('SC','30thDC','me','date','sortie depuis juillet 2025'),
  ('SC','30thKPZSTTZ1','me','date','sortie depuis juillet 2025'),
  ('SC','30thKPZSTTZ2','me','date','sortie depuis juillet 2025'),
  ('SC','30thSCZSLH','me','date','sortie depuis juillet 2025'),
  ('SC','MISSION10','me','date','sortie depuis juillet 2025'),
  ('SC','PROMO','sm','nom_du_set','nom du set : 太阳&月亮'),
  ('SC','PROMO1','sv','nom_du_set','nom du set : 朱&紫, tournois 2023-2025'),
  ('SC','PROMO13','sv','nom_du_set','nom du set : 朱&紫, tournois 2023-2025'),
  ('SC','PROMO14','sv','nom_du_set','nom du set : 朱&紫, tournois 2023-2025'),
  ('SC','PROMO15','swsh','nom_du_set','nom du set : 剑&盾 / VSTAR'),
  ('SC','PROMO19','sv','nom_du_set','nom du set : 朱&紫, tournois 2023-2025'),
  ('SC','PROMO2','sm','nom_du_set','nom du set : 太阳&月亮'),
  ('SC','PROMO21','sv','nom_du_set','nom du set : 朱&紫, tournois 2023-2025'),
  ('SC','PROMO22','sv','nom_du_set','nom du set : 朱&紫, tournois 2023-2025'),
  ('SC','PROMO23','swsh','nom_du_set','nom du set : 剑&盾 / VSTAR'),
  ('SC','PROMO24','swsh','nom_du_set','nom du set : 剑&盾 / VSTAR'),
  ('SC','PROMO26','sv','nom_du_set','nom du set : 朱&紫, tournois 2023-2025'),
  ('SC','PROMO27','sv','nom_du_set','nom du set : 朱&紫, tournois 2023-2025'),
  ('SC','PROMO3','swsh','nom_du_set','nom du set : 剑&盾 / VSTAR'),
  ('SC','PROMO4','swsh','nom_du_set','nom du set : 剑&盾 / VSTAR'),
  ('SC','PROMO6','sv','nom_du_set','nom du set : 朱&紫, tournois 2023-2025'),
  ('SC','PROMO9','sv','nom_du_set','nom du set : 朱&紫, tournois 2023-2025'),
  ('SC','PROMOGIFT05','me','date','sortie depuis juillet 2025'),
  ('SC','PROMOSV01','sv','nom_du_set','nom du set : 朱&紫, tournois 2023-2025'),
  ('SC','PROMOSV02','sv','nom_du_set','nom du set : 朱&紫, tournois 2023-2025'),
  ('SC','PROMOSV03','sv','nom_du_set','nom du set : 朱&紫, tournois 2023-2025'),
  ('SC','PROMOSV06','sv','nom_du_set','nom du set : 朱&紫, tournois 2023-2025'),
  ('SC','PROMOSVEVENT05','me','date','sortie depuis juillet 2025'),
  ('SC','PROMOSVML02','me','date','sortie depuis juillet 2025'),
  ('SC','PROMOSVML03','me','date','sortie depuis juillet 2025'),
  ('SC','PROMOSVML04','me','date','sortie depuis juillet 2025')
on conflict (language, code) do nothing;

create or replace function public.apply_set_series()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare n1 integer; n2 integer; n3 integer;
begin
  -- 1. classement explicite
  update sets s set series_id = m.series_id
  from set_series_map m
  where m.language = s.language and m.code = s.code and s.series_id is null;
  get diagnostics n1 = row_count;

  -- 2. KR / TC / SC : série du set JP aligné
  update sets s set series_id = jp.series_id
  from set_alignments a join sets jp on jp.id = a.jp_set_id
  where a.set_id = s.id and s.language in ('KR','TC','SC')
    and s.series_id is null and jp.series_id is not null;
  get diagnostics n2 = row_count;

  -- 3. texte français de la série
  update sets s set series = sr.name_fr
  from series sr
  where sr.code = s.series_id and s.series is distinct from sr.name_fr;
  get diagnostics n3 = row_count;

  return n1 + n2 + n3;
end $$;
revoke execute on function public.apply_set_series() from public, anon, authenticated;

create temp table rapport (ordre int, controle text, n bigint) on commit drop;
insert into rapport select 1, 'lignes modifiées par apply_set_series (séries + textes)', public.apply_set_series();

insert into rapport
select 10 + row_number() over (order by language, series_id),
       language || ' — ' || coalesce(series_id, 'SANS SÉRIE'), count(*)
from public.sets group by language, series_id;

insert into rapport
select 80, 'sets sans série (attendu 0)', count(*) from public.sets where series_id is null
union all
select 81, 'sets avec série mais sans texte (attendu 0)', count(*) from public.sets where series_id is not null and series is null
union all
select 82, 'cartes dans des sets classés « autre »', count(*) from public.cards c join public.sets s on s.id = c.set_id where s.series_id = 'autre'
union all
select 83, 'sets classés « autre »', count(*) from public.sets where series_id = 'autre';

-- Cohérence nom du set / série pour KR et TC (le nom nomme l'ère)
create temp table incoh on commit drop as
select s.language, s.code, s.name, s.series_id,
  case
    when s.language = 'KR' and s.name ~ '^BW' then 'bw'
    when s.language = 'KR' and s.name ~ '^DP' then 'dp'
    when s.language = 'KR' and s.name ~ '^XY' then 'xy'
    when s.language = 'KR' and s.name ~ '^썬&문' then 'sm'
    when s.language = 'KR' and s.name ~ '^소드&실드' then 'swsh'
    when s.language = 'KR' and s.name ~ '^스칼렛&바이올렛' then 'sv'
    when s.language = 'TC' and s.name ~ '劍&盾' then 'swsh'
    when s.language = 'TC' and s.name ~ '太陽&月亮' then 'sm'
    when s.language = 'TC' and s.name ~ '朱&紫' then 'sv'
    when s.language = 'TC' and s.name ~ '超級' then 'me'
  end as attendu
from public.sets s where s.language in ('KR','TC');
insert into rapport
select 90, 'KR/TC : nom du set et série en désaccord (à examiner)', count(*) from incoh
where attendu is not null and series_id <> attendu and series_id <> 'autre';

select * from rapport order by ordre;

commit;
